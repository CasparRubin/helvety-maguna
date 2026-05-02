use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use llama_cpp::{standard_sampler::StandardSampler, LlamaModel, SessionParams};
use tauri::Emitter;

pub fn stream_chat_completion(
    app: &tauri::AppHandle,
    model: &Arc<LlamaModel>,
    prompt: String,
    max_tokens: usize,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let mut session = model
        .create_session(SessionParams::default())
        .map_err(|e| e.to_string())?;
    session
        .advance_context(prompt.as_str())
        .map_err(|e| e.to_string())?;
    let completions = session
        .start_completing_with(StandardSampler::new_greedy(), max_tokens)
        .map_err(|e| e.to_string())?;
    for piece in completions.into_strings() {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        app.emit("inference-chunk", piece)
            .map_err(|e| e.to_string())?;
    }
    let _ = app.emit("inference-done", ());
    Ok(())
}
