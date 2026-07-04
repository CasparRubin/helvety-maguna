//! Spike-load a GGUF and emit a short greedy completion (engine smoke test).
//!
//! ```bash
//! # Raw text is only a rough smoke test. Instruct families (Qwen, Gemma, GLM, Phi-4, …)
//! # need a formatted prompt — see `src/chat_template.rs` and unit tests there.
//! cargo run --example spike_load --features llama -- /path/to/model.gguf "Say hi in one word."
//! ```
use std::env;
use std::num::NonZeroU32;
use std::path::Path;

use llama_cpp_4::context::params::LlamaContextParams;
use llama_cpp_4::llama_backend::LlamaBackend;
use llama_cpp_4::llama_batch::LlamaBatch;
use llama_cpp_4::model::params::LlamaModelParams;
use llama_cpp_4::model::{AddBos, LlamaModel, Special};
use llama_cpp_4::sampling::LlamaSampler;

fn main() -> Result<(), String> {
    let path = env::args()
        .nth(1)
        .ok_or_else(|| "usage: spike_load <model.gguf> [prompt]".to_string())?;
    let prompt = env::args().nth(2).unwrap_or_else(|| "Hello".into());
    if !Path::new(&path).is_file() {
        return Err(format!("file not found: {path}"));
    }

    let backend = LlamaBackend::init().map_err(|e| format!("backend init: {e}"))?;
    let model = LlamaModel::load_from_file(&backend, &path, &LlamaModelParams::default())
        .map_err(|e| format!("load model: {e}"))?;
    eprintln!("loaded {path}");

    let ctx_params = LlamaContextParams::default().with_n_ctx(Some(
        NonZeroU32::new(512).ok_or_else(|| "invalid n_ctx".to_string())?,
    ));
    let mut ctx = model
        .new_context(&backend, ctx_params)
        .map_err(|e| format!("create context: {e}"))?;

    let tokens = model
        .str_to_token(prompt.as_str(), AddBos::Always)
        .map_err(|e| format!("tokenize: {e}"))?;
    let n_prompt = tokens.len();
    let mut batch = LlamaBatch::new(512, 1);
    for (i, &tok) in tokens.iter().enumerate() {
        batch
            .add(tok, i as i32, &[0], i + 1 == n_prompt)
            .map_err(|e| format!("prefill batch: {e}"))?;
    }
    ctx.decode(&mut batch)
        .map_err(|e| format!("prefill decode: {e}"))?;

    let sampler = LlamaSampler::chain_simple([LlamaSampler::greedy()]);
    let mut logit_idx = (n_prompt as i32) - 1;
    let mut out = String::new();
    for pos in (n_prompt as i32..).take(32) {
        let token = sampler.sample(&ctx, logit_idx);
        logit_idx = 0;
        if model.is_eog_token(token) {
            break;
        }
        let bytes = model
            .token_to_bytes(token, Special::Plaintext)
            .map_err(|e| format!("token to bytes: {e}"))?;
        out.push_str(&String::from_utf8_lossy(&bytes));
        batch.clear();
        batch
            .add(token, pos, &[0], true)
            .map_err(|e| format!("decode batch: {e}"))?;
        ctx.decode(&mut batch).map_err(|e| format!("decode: {e}"))?;
    }

    println!("{out}");
    Ok(())
}
