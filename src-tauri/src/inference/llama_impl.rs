use std::num::NonZeroU32;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use llama_cpp_4::context::params::LlamaContextParams;
use llama_cpp_4::llama_backend::LlamaBackend;
use llama_cpp_4::llama_batch::LlamaBatch;
use llama_cpp_4::model::{AddBos, LlamaModel, Special};
use llama_cpp_4::sampling::LlamaSampler;
use tauri::Emitter;

/// Context length for each inference session. Real prompts plus output; KV memory grows with this value.
const SESSION_N_CTX: u32 = 8192;

pub fn stream_chat_completion(
    app: &tauri::AppHandle,
    backend: &LlamaBackend,
    model: &Arc<LlamaModel>,
    prompt: String,
    max_tokens: usize,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let ctx_params = LlamaContextParams::default().with_n_ctx(Some(
        NonZeroU32::new(SESSION_N_CTX).ok_or_else(|| "invalid n_ctx".to_string())?,
    ));
    let mut ctx = model
        .new_context(backend, ctx_params)
        .map_err(|e| format!("create context: {e}"))?;

    let _ = app.emit("inference-phase", "prefill");

    let tokens = model
        .str_to_token(prompt.as_str(), AddBos::Always)
        .map_err(|e| format!("tokenize prompt: {e}"))?;
    let n_prompt = tokens.len();
    if n_prompt == 0 {
        return Err("prompt tokenized to empty sequence".into());
    }

    let room = SESSION_N_CTX as usize - n_prompt - 16;
    let gen_cap = max_tokens.min(room.max(1));

    let mut batch = LlamaBatch::new(SESSION_N_CTX as usize, 1);
    for (i, &tok) in tokens.iter().enumerate() {
        batch
            .add(tok, i as i32, &[0], i + 1 == n_prompt)
            .map_err(|e| format!("prefill batch: {e}"))?;
    }
    ctx.decode(&mut batch)
        .map_err(|e| format!("prefill decode: {e}"))?;

    let _ = app.emit("inference-phase", "generating");

    let sampler = LlamaSampler::chain_simple([LlamaSampler::greedy()]);
    // After prefill logits are on the last batch slot; single-token decodes use slot 0.
    let mut logit_idx = (n_prompt as i32) - 1;

    for pos in (n_prompt as i32..).take(gen_cap) {
        if cancel.load(Ordering::SeqCst) {
            break;
        }

        let token = sampler.sample(&ctx, logit_idx);
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
        ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;
    }

    let _ = app.emit("inference-done", ());
    Ok(())
}
