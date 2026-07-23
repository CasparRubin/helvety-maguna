//! Optional multi-token prediction (MTP) speculative decode for models with MTP heads
//! (e.g. Gemma 4). Uses an in-model [`LlamaContextType::Mtp`] draft context.
//! Catalog `mtp-draft.gguf` sidecars are downloaded/stored for tooling and are **not**
//! loaded by this path today.

use std::num::NonZeroU32;

use llama_cpp_4::context::params::{LlamaContextParams, LlamaContextType};
use llama_cpp_4::context::LlamaContext;
use llama_cpp_4::llama_backend::LlamaBackend;
use llama_cpp_4::llama_batch::LlamaBatch;
use llama_cpp_4::model::{LlamaModel, Special};
use llama_cpp_4::mtp::{MtpSession, MtpSessionConfig};
use llama_cpp_4::sampling::LlamaSampler;
use llama_cpp_4::token::LlamaToken;
use tauri::Emitter;

use super::llama_impl::SESSION_N_CTX;

const N_DRAFT_MAX: i32 = 3;

/// When the loaded model exposes MTP heads, create a draft context + session.
/// Returns `None` when the model does not support MTP (caller uses normal decode).
///
/// `target` is only borrowed for the duration of this call (`MtpSession` keeps a raw pointer).
pub fn try_attach_mtp<'m>(
    backend: &LlamaBackend,
    model: &'m LlamaModel,
    target: &LlamaContext<'_>,
) -> Option<(LlamaContext<'m>, MtpSession)> {
    let n_draft = N_DRAFT_MAX as u32;
    let draft_params = LlamaContextParams::default()
        .with_n_ctx(NonZeroU32::new(SESSION_N_CTX))
        .with_ctx_type(LlamaContextType::Mtp)
        .with_n_rs_seq(n_draft.max(4));
    let draft = model.new_context(backend, draft_params).ok()?;
    let config = MtpSessionConfig::new(1, N_DRAFT_MAX).with_p_min(0.0);
    let session = MtpSession::new_with_config(target, &draft, config).ok()?;
    tracing::info!("MTP speculative decode enabled (n_draft_max={N_DRAFT_MAX})");
    Some((draft, session))
}

/// One speculative step: sample a verified token, then greedily accept matching drafts.
/// Returns tokens that were accepted into the target KV (including the first sample).
///
/// The MTP draft [`LlamaContext`] must stay alive while `session` is used (held by the caller).
#[allow(clippy::too_many_arguments)]
pub fn mtp_step(
    app: &tauri::AppHandle,
    model: &LlamaModel,
    target: &mut LlamaContext<'_>,
    session: &mut MtpSession,
    sampler: &mut LlamaSampler,
    batch: &mut LlamaBatch,
    mut pos: i32,
    logit_idx: i32,
    cancel: &std::sync::atomic::AtomicBool,
) -> Result<(Vec<LlamaToken>, i32), String> {
    use std::sync::atomic::Ordering;

    let mut out = Vec::new();
    let first = sampler.sample(target, logit_idx);
    sampler.accept(first);
    if model.is_eog_token(first) {
        return Ok((out, pos));
    }
    emit_token(app, model, first)?;
    batch.clear();
    batch
        .add(first, pos, &[0], true)
        .map_err(|e| format!("mtp batch: {e}"))?;
    target
        .decode(batch)
        .map_err(|e| format!("mtp decode: {e}"))?;
    let _ = session.process(batch);
    out.push(first);
    pos += 1;

    let drafts = session.draft(0, pos, first).unwrap_or_default();
    let mut accepted: u16 = 0;
    for draft_tok in drafts {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        // Verify: target must greedily agree with the draft token.
        let verified = sampler.sample(target, 0);
        if verified.0 != draft_tok.0 {
            break;
        }
        sampler.accept(verified);
        if model.is_eog_token(verified) {
            let _ = session.accept(0, accepted);
            return Ok((out, pos));
        }
        emit_token(app, model, verified)?;
        batch.clear();
        batch
            .add(verified, pos, &[0], true)
            .map_err(|e| format!("mtp draft batch: {e}"))?;
        target
            .decode(batch)
            .map_err(|e| format!("mtp draft decode: {e}"))?;
        let _ = session.process(batch);
        out.push(verified);
        pos += 1;
        accepted = accepted.saturating_add(1);
    }
    let _ = session.accept(0, accepted);
    Ok((out, pos))
}

fn emit_token(app: &tauri::AppHandle, model: &LlamaModel, token: LlamaToken) -> Result<(), String> {
    let bytes = model
        .token_to_bytes(token, Special::Plaintext)
        .map_err(|e| format!("token to bytes: {e}"))?;
    let piece = String::from_utf8_lossy(&bytes).into_owned();
    if !piece.is_empty() {
        app.emit("inference-chunk", piece)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
