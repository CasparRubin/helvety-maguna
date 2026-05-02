use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use futures_util::StreamExt;
use llama_cpp::{standard_sampler::StandardSampler, LlamaModel, SessionParams};
use tauri::Emitter;

/// Context length for each inference session. The llama.cpp default (512) is far too small for
/// real prompts plus output and can break generation; KV memory grows with this value.
const SESSION_N_CTX: u32 = 8192;

pub fn stream_chat_completion(
    app: &tauri::AppHandle,
    model: &Arc<LlamaModel>,
    prompt: String,
    max_tokens: usize,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let session_params = SessionParams {
        n_ctx: SESSION_N_CTX,
        ..Default::default()
    };

    let mut session = model
        .create_session(session_params)
        .map_err(|e| e.to_string())?;

    let _ = app.emit("inference-phase", "prefill");
    session
        .advance_context(prompt.as_str())
        .map_err(|e| e.to_string())?;

    let _ = app.emit("inference-phase", "generating");

    let prompt_tokens = session.context_size();
    let ctx_limit = session.params().n_ctx as usize;
    let room = ctx_limit.saturating_sub(prompt_tokens).saturating_sub(16);
    let gen_cap = max_tokens.min(room.max(1));

    let completions = session
        .start_completing_with(StandardSampler::new_greedy(), gen_cap)
        .map_err(|e| e.to_string())?;

    // `llama_cpp`'s `Iterator` over completions uses `tokio::task::block_in_place` + blocking
    // recv, which deadlocks when this function runs inside `spawn_blocking`. The `Stream`
    // implementation uses async `poll_recv` instead; drive it with a tiny one-thread runtime.
    let mut string_stream = completions.into_strings();
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| e.to_string())?;

    rt.block_on(async {
        while let Some(piece) = StreamExt::next(&mut string_stream).await {
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            app.emit("inference-chunk", piece)
                .map_err(|e| e.to_string())?;
        }
        Ok::<(), String>(())
    })?;

    let _ = app.emit("inference-done", ());
    Ok(())
}
