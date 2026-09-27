use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use llama_cpp_4::context::params::{LlamaContextParams, LlamaFlashAttnType};
use llama_cpp_4::context::LlamaContext;
use llama_cpp_4::llama_backend::LlamaBackend;
use llama_cpp_4::llama_batch::LlamaBatch;
use llama_cpp_4::model::params::LlamaModelParams;
use llama_cpp_4::model::{AddBos, LlamaModel};
use llama_cpp_4::quantize::GgmlType;
use llama_cpp_4::token::LlamaToken;
use parking_lot::Mutex;
use tauri::Emitter;

use super::sampler::SamplerProfile;

/// Context length for each inference session. Real prompts plus output; KV memory grows with this value.
pub const SESSION_N_CTX: u32 = 8192;

/// Load weights with in-model MTP heads when the GGUF ships them (Gemma 4 / Qwen 3.8).
pub fn maguna_model_params() -> LlamaModelParams {
    LlamaModelParams::default().with_load_mtp(true)
}

/// Session context: 8K ctx, flash attention Auto, symmetric Q8_0 KV (same K and V).
pub fn maguna_context_params(n_ctx: u32) -> Result<LlamaContextParams, String> {
    Ok(LlamaContextParams::default()
        .with_n_ctx(Some(
            NonZeroU32::new(n_ctx).ok_or_else(|| "invalid n_ctx".to_string())?,
        ))
        .with_flash_attn_type(LlamaFlashAttnType::Auto)
        .with_cache_type_k(GgmlType::Q8_0)
        .with_cache_type_v(GgmlType::Q8_0))
}

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
        let ctx_params = maguna_context_params(SESSION_N_CTX)?;
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

    let mut sampler = sampler_profile.build(model.n_vocab());
    let mut generated: Vec<LlamaToken> = Vec::new();
    let mut next_logit = logit_idx;

    // Greedy only: draft verification re-samples the target and is unreliable
    // with temperature. On-disk `mtp-draft.gguf` sidecars are not loaded here.
    let mut mtp_draft = if matches!(sampler_profile, SamplerProfile::Greedy) {
        let model_static: &'static LlamaModel =
            // SAFETY: `model` outlives `mtp_draft` (dropped before this function returns).
            unsafe { &*Arc::as_ptr(model) };
        super::mtp_accel::try_create_mtp_draft(backend, model_static)
    } else {
        None
    };

    let mut pos = session.tokens.len() as i32;
    let mut produced = 0usize;
    // `MtpSession` exclusively borrows `session.ctx` for the speculative loop.
    let used_mtp = if let Some(draft) = mtp_draft.as_mut() {
        match llama_cpp_4::mtp::MtpSession::new_with_config(
            &mut session.ctx,
            draft,
            super::mtp_accel::mtp_session_config(),
        ) {
            Ok(mut mtp) => {
                tracing::info!("MTP speculative decode enabled");
                while produced < gen_cap {
                    if cancel.load(Ordering::SeqCst) {
                        break;
                    }
                    let (step_tokens, new_pos) = super::mtp_accel::mtp_step(
                        app,
                        model.as_ref(),
                        &mut mtp,
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
                }
                true
            }
            Err(_) => false,
        }
    } else {
        false
    };

    if !used_mtp {
        while produced < gen_cap {
            if cancel.load(Ordering::SeqCst) {
                break;
            }

            let token = sampler.sample(&session.ctx, next_logit);
            sampler.accept(token);
            next_logit = 0;
            if model.is_eog_token(token) {
                break;
            }

            super::mtp_accel::emit_token(app, model.as_ref(), token)?;

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
    }

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
