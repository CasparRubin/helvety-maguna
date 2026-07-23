use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use llama_cpp_4::context::params::LlamaContextParams;
use llama_cpp_4::context::LlamaContext;
use llama_cpp_4::llama_backend::LlamaBackend;
use llama_cpp_4::llama_batch::LlamaBatch;
use llama_cpp_4::model::{AddBos, LlamaModel, Special};
use llama_cpp_4::token::LlamaToken;
use parking_lot::Mutex;
use tauri::Emitter;

use super::sampler::SamplerProfile;

/// Context length for each inference session. Real prompts plus output; KV memory grows with this value.
pub const SESSION_N_CTX: u32 = 8192;

/// Persisted Chat KV across multi-turn Send calls for one loaded model.
///
/// `LlamaContext` borrows the model; we keep an [`Arc`] and extend the borrow to
/// `'static` for the lifetime of this session (context is dropped before the Arc).
pub struct ChatKvSession {
    pub model_id: String,
    model: Arc<LlamaModel>,
    ctx: LlamaContext<'static>,
    /// Tokens already in the KV cache (prompt + generated), in order.
    tokens: Vec<LlamaToken>,
}

// SAFETY: Session is only accessed under a Mutex; context decode is single-threaded.
unsafe impl Send for ChatKvSession {}

impl ChatKvSession {
    fn new(
        backend: &LlamaBackend,
        model_id: String,
        model: Arc<LlamaModel>,
    ) -> Result<Self, String> {
        let ctx_params = LlamaContextParams::default().with_n_ctx(Some(
            NonZeroU32::new(SESSION_N_CTX).ok_or_else(|| "invalid n_ctx".to_string())?,
        ));
        let model_ref: &'static LlamaModel =
            // SAFETY: `model` Arc outlives `ctx` because both live in this struct;
            // we drop `ctx` before dropping `model` when replacing / clearing the session.
            unsafe { &*Arc::as_ptr(&model) };
        let ctx = model_ref
            .new_context(backend, ctx_params)
            .map_err(|e| format!("create context: {e}"))?;
        Ok(Self {
            model_id,
            model,
            ctx,
            tokens: Vec::new(),
        })
    }

    fn clear_cache(&mut self) {
        self.ctx.clear_kv_cache();
        self.tokens.clear();
    }
}

fn common_prefix_len(a: &[LlamaToken], b: &[LlamaToken]) -> usize {
    a.iter()
        .zip(b.iter())
        .take_while(|(x, y)| x.0 == y.0)
        .count()
}

/// Stream a completion. When `reuse_kv` is true, reuse / extend [`ChatKvSession`]
/// so multi-turn Chat only prefills the new suffix.
#[allow(clippy::too_many_arguments)]
pub fn stream_chat_completion(
    app: &tauri::AppHandle,
    backend: &LlamaBackend,
    model: &Arc<LlamaModel>,
    model_id: &str,
    prompt: String,
    max_tokens: usize,
    cancel: &AtomicBool,
    chat_kv: &Mutex<Option<ChatKvSession>>,
    reuse_kv: bool,
    sampler_profile: SamplerProfile,
) -> Result<(), String> {
    let tokens = model
        .str_to_token(prompt.as_str(), AddBos::Always)
        .map_err(|e| format!("tokenize prompt: {e}"))?;
    let n_prompt = tokens.len();
    if n_prompt == 0 {
        return Err("prompt tokenized to empty sequence".into());
    }
    if n_prompt >= SESSION_N_CTX as usize - 16 {
        // Stale prefix must not survive an overflowed turn.
        *chat_kv.lock() = None;
        return Err("prompt exceeds context window".into());
    }

    let _ = app.emit("inference-phase", "prefill");

    let mut session_guard = chat_kv.lock();

    let can_reuse = reuse_kv
        && session_guard
            .as_ref()
            .is_some_and(|s| s.model_id == model_id && Arc::ptr_eq(&s.model, model));

    if !can_reuse {
        *session_guard = Some(ChatKvSession::new(
            backend,
            model_id.to_string(),
            Arc::clone(model),
        )?);
    }

    let session = session_guard
        .as_mut()
        .ok_or_else(|| "chat KV session missing".to_string())?;

    let prefix = if reuse_kv {
        common_prefix_len(&session.tokens, &tokens)
    } else {
        0
    };

    if prefix == 0 {
        if !session.tokens.is_empty() {
            session.clear_cache();
        }
    } else if prefix < session.tokens.len() {
        let _ = session
            .ctx
            .clear_kv_cache_seq(Some(0), Some(prefix as u32), None);
        session.tokens.truncate(prefix);
    }

    let mut batch = LlamaBatch::new(SESSION_N_CTX as usize, 1);

    let logit_idx: i32 = if prefix < n_prompt {
        let suffix = &tokens[prefix..];
        for (i, &tok) in suffix.iter().enumerate() {
            let pos = (prefix + i) as i32;
            let logits = i + 1 == suffix.len();
            batch
                .add(tok, pos, &[0], logits)
                .map_err(|e| format!("prefill batch: {e}"))?;
        }
        session
            .ctx
            .decode(&mut batch)
            .map_err(|e| format!("prefill decode: {e}"))?;
        session.tokens.extend_from_slice(suffix);
        (suffix.len() as i32) - 1
    } else {
        // Full prompt already in KV — re-evaluate the last token for fresh logits.
        let last_pos = (n_prompt as i32) - 1;
        let last = tokens[n_prompt - 1];
        let _ =
            session
                .ctx
                .clear_kv_cache_seq(Some(0), Some(last_pos as u32), Some(n_prompt as u32));
        if session.tokens.len() >= n_prompt {
            session.tokens.truncate(n_prompt - 1);
        }
        batch.clear();
        batch
            .add(last, last_pos, &[0], true)
            .map_err(|e| format!("refresh logits: {e}"))?;
        session
            .ctx
            .decode(&mut batch)
            .map_err(|e| format!("refresh decode: {e}"))?;
        session.tokens.push(last);
        0
    };

    let room = SESSION_N_CTX as usize - session.tokens.len() - 16;
    let gen_cap = max_tokens.min(room.max(1));

    let _ = app.emit("inference-phase", "generating");

    let mut sampler = sampler_profile.build();
    let mut generated: Vec<LlamaToken> = Vec::new();
    let mut next_logit = logit_idx;

    // Best-effort in-model MTP (Gemma 4 heads). Catalog may also ship
    // `mtp-draft.gguf` for tooling; llama-cpp-4's MtpSession uses a same-model
    // LlamaContextType::Mtp draft context, not that separate GGUF.
    // Only enable under greedy sampling — draft verification re-samples the
    // target and is unreliable with temperature chains.
    let mtp_model_keep = Arc::clone(&session.model);
    let mut mtp_bundle = if matches!(sampler_profile, SamplerProfile::Greedy) {
        let model_static: &'static LlamaModel =
            // SAFETY: `mtp_model_keep` outlives `mtp_bundle` (both dropped below).
            unsafe { &*Arc::as_ptr(&mtp_model_keep) };
        super::mtp_accel::try_attach_mtp(backend, model_static, &session.ctx)
    } else {
        None
    };
    let model_ref = mtp_model_keep.as_ref();

    let mut pos = session.tokens.len() as i32;
    let mut produced = 0usize;
    while produced < gen_cap {
        if cancel.load(Ordering::SeqCst) {
            break;
        }

        if let Some((_, ref mut mtp)) = mtp_bundle {
            let (step_tokens, new_pos) = super::mtp_accel::mtp_step(
                app,
                model_ref,
                &mut session.ctx,
                mtp,
                &mut sampler,
                &mut batch,
                pos,
                next_logit,
                cancel,
            )?;
            if step_tokens.is_empty() {
                break;
            }
            produced += step_tokens.len();
            generated.extend_from_slice(&step_tokens);
            pos = new_pos;
            next_logit = 0;
            continue;
        }

        let token = sampler.sample(&session.ctx, next_logit);
        sampler.accept(token);
        next_logit = 0;
        if model.is_eog_token(token) {
            break;
        }

        let bytes = model
            .token_to_bytes(token, Special::Plaintext)
            .map_err(|e| format!("token to bytes: {e}"))?;
        let piece = String::from_utf8_lossy(&bytes).into_owned();
        if !piece.is_empty() {
            app.emit("inference-chunk", piece)
                .map_err(|e| e.to_string())?;
        }

        batch.clear();
        batch
            .add(token, pos, &[0], true)
            .map_err(|e| format!("decode batch: {e}"))?;
        session
            .ctx
            .decode(&mut batch)
            .map_err(|e| format!("decode: {e}"))?;
        generated.push(token);
        pos += 1;
        produced += 1;
    }

    drop(mtp_bundle);
    drop(mtp_model_keep);

    if cancel.load(Ordering::SeqCst) || !reuse_kv {
        *session_guard = None;
    } else {
        session.tokens.extend_from_slice(&generated);
    }

    let _ = app.emit("inference-done", ());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::common_prefix_len;
    use llama_cpp_4::token::LlamaToken;

    #[test]
    fn common_prefix_len_counts_matching_prefix() {
        let a = [LlamaToken(1), LlamaToken(2), LlamaToken(3)];
        let b = [LlamaToken(1), LlamaToken(2), LlamaToken(9)];
        assert_eq!(common_prefix_len(&a, &b), 2);
        assert_eq!(common_prefix_len(&a, &a), 3);
        assert_eq!(common_prefix_len(&a, &[]), 0);
        assert_eq!(common_prefix_len(&[], &b), 0);
        assert_eq!(common_prefix_len(&[LlamaToken(1)], &[LlamaToken(2)]), 0);
    }
}
