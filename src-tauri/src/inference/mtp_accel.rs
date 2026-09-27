//! In-model MTP speculative decode ([`LlamaContextType::Mtp`]).
//! Separate `mtp-draft.gguf` files, if an older install left one on disk, are not loaded.

use llama_cpp_4::context::params::LlamaContextType;
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

/// Same-model MTP draft context, or `None` when the GGUF has no MTP heads.
/// Keep this alive and pass `&mut` it into [`MtpSession::new_with_config`].
pub fn try_create_mtp_draft<'m>(
    backend: &LlamaBackend,
    model: &'m LlamaModel,
) -> Option<LlamaContext<'m>> {
    let n_draft = N_DRAFT_MAX as u32;
    let draft_params = super::llama_impl::maguna_context_params(SESSION_N_CTX)
        .ok()?
        .with_ctx_type(LlamaContextType::Mtp)
        .with_n_rs_seq(n_draft.max(4));
    model.new_context(backend, draft_params).ok()
}

pub fn mtp_session_config() -> MtpSessionConfig {
    MtpSessionConfig::new(1, N_DRAFT_MAX)
}

/// One speculative step: sample a verified token, then greedily accept matching drafts.
/// Returns tokens that were accepted into the target KV (including the first sample).
#[allow(clippy::too_many_arguments)]
pub fn mtp_step(
    app: &tauri::AppHandle,
    model: &LlamaModel,
    session: &mut MtpSession<'_, '_>,
    sampler: &mut LlamaSampler,
    batch: &mut LlamaBatch,
    mut pos: i32,
    logit_idx: i32,
    cancel: &std::sync::atomic::AtomicBool,
) -> Result<(Vec<LlamaToken>, i32), String> {
    use std::sync::atomic::Ordering;

    let mut out = Vec::new();
    let first = sampler.sample(session.target_context(), logit_idx);
    sampler.accept(first);
    if model.is_eog_token(first) {
        return Ok((out, pos));
    }
    emit_token(app, model, first)?;
    batch.clear();
    batch
        .add(first, pos, &[0], true)
        .map_err(|e| format!("mtp batch: {e}"))?;
    session
        .decode_target_and_process(batch)
        .map_err(|e| format!("mtp decode: {e}"))?;
    out.push(first);
    pos += 1;

    let drafts = session.draft(0, pos, first).unwrap_or_default();
    let mut accepted: u16 = 0;
    for draft_tok in drafts {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let verified = sampler.sample(session.target_context(), 0);
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
        session
            .decode_target_and_process(batch)
            .map_err(|e| format!("mtp draft decode: {e}"))?;
        out.push(verified);
        pos += 1;
        accepted = accepted.saturating_add(1);
    }
    let _ = session.accept(0, accepted);
    Ok((out, pos))
}

pub(super) fn emit_token(
    app: &tauri::AppHandle,
    model: &LlamaModel,
    token: LlamaToken,
) -> Result<(), String> {
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
