//! Optional vision path via llama.cpp `mtmd` when a catalog mmproj is installed.

use std::num::NonZeroU32;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use llama_cpp_4::context::params::LlamaContextParams;
use llama_cpp_4::llama_backend::LlamaBackend;
use llama_cpp_4::llama_batch::LlamaBatch;
use llama_cpp_4::model::{LlamaModel, Special};
use llama_cpp_4::mtmd::{
    MtmdBitmap, MtmdContext, MtmdContextParams, MtmdInputChunks, MtmdInputText,
};
use tauri::Emitter;

use super::llama_impl::SESSION_N_CTX;
use super::sampler::SamplerProfile;

/// Prefill via mtmd (image + text), then stream tokens like a normal completion.
#[allow(clippy::too_many_arguments)]
pub fn stream_completion_with_image(
    app: &tauri::AppHandle,
    backend: &LlamaBackend,
    model: &Arc<LlamaModel>,
    mmproj_path: &Path,
    image_path: &Path,
    prompt: &str,
    max_tokens: usize,
    cancel: &AtomicBool,
    sampler_profile: SamplerProfile,
) -> Result<(), String> {
    if !mmproj_path.is_file() {
        return Err(
            "No mmproj.gguf for this model. Install Gemma 4 12B from the catalog (includes the vision projector)."
                .into(),
        );
    }
    if !image_path.is_file() {
        return Err(format!("image not found: {}", image_path.display()));
    }

    let _ = app.emit("inference-phase", "prefill");

    let ctx_params = LlamaContextParams::default().with_n_ctx(Some(
        NonZeroU32::new(SESSION_N_CTX).ok_or_else(|| "invalid n_ctx".to_string())?,
    ));
    let mut lctx = model
        .new_context(backend, ctx_params)
        .map_err(|e| format!("create context: {e}"))?;

    let mtmd_params = MtmdContextParams::default().use_gpu(true);
    let mtmd = MtmdContext::init_from_file(mmproj_path, model.as_ref(), mtmd_params)
        .map_err(|e| format!("mtmd init: {e}"))?;
    if !mtmd.supports_vision() {
        return Err("installed mmproj does not support vision".into());
    }

    let bitmap =
        MtmdBitmap::from_file(&mtmd, image_path).map_err(|e| format!("load image: {e}"))?;
    let marker = MtmdContext::default_marker();
    let combined = if prompt.contains(marker) {
        prompt.to_string()
    } else {
        format!("{marker}\n{prompt}")
    };
    let text = MtmdInputText::new(&combined, true, true);
    let bitmaps = [&bitmap];
    let mut chunks = MtmdInputChunks::new();
    mtmd.tokenize(&text, &bitmaps, &mut chunks)
        .map_err(|e| format!("mtmd tokenize: {e}"))?;

    let n_batch = lctx.n_batch() as i32;
    let mut n_past = 0i32;
    mtmd.eval_chunks(lctx.as_ptr(), &chunks, 0, 0, n_batch, true, &mut n_past)
        .map_err(|e| format!("mtmd eval: {e}"))?;

    let room = SESSION_N_CTX as usize - (n_past as usize) - 16;
    let gen_cap = max_tokens.min(room.max(1));

    let _ = app.emit("inference-phase", "generating");

    let mut sampler = sampler_profile.build();
    let mut batch = LlamaBatch::new(SESSION_N_CTX as usize, 1);
    let mut logit_idx = 0i32;

    for pos in (n_past..).take(gen_cap) {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let token = sampler.sample(&lctx, logit_idx);
        sampler.accept(token);
        logit_idx = 0;
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
        lctx.decode(&mut batch)
            .map_err(|e| format!("decode: {e}"))?;
    }

    let _ = app.emit("inference-done", ());
    Ok(())
}
