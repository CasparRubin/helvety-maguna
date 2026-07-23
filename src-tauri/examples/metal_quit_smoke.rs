//! Reproduce / verify Metal residency teardown vs `process::exit`.
//!
//! Tauri Dock Quit calls `process::exit`, which skips Rust `Drop`. Maguna's
//! `AppState::prepare_for_exit` (on `ExitRequested`) joins any decode worker and
//! unloads the model first so Metal buffers are freed while Rust still runs.
//! Without that unload, ggml's process-static Metal device destructor sees
//! non-empty residency sets and aborts (`GGML_ASSERT` in `ggml_metal_rsets_free`).
//!
//! This example isolates the buffer-drop vs leak question (no Tauri event loop):
//!
//! ```bash
//! cargo run --example metal_quit_smoke --features llama -- \
//!   "/path/to/model.gguf" drop
//! cargo run --example metal_quit_smoke --features llama -- \
//!   "/path/to/model.gguf" leak
//! ```
//!
//! Prefer an already-installed GGUF under app-data `maguna/models` (see
//! `.cursor/rules/local-gguf-testing.mdc`); do not download weights for this check.
//!
//! `drop` → load, drop model, forget backend, `process::exit(0)` (expect exit 0).
//! `leak` → load, forget model+backend, `process::exit(0)` (expect SIGABRT / 134 on macOS 15+).
use std::env;
use std::path::Path;

use llama_cpp_4::llama_backend::LlamaBackend;
use llama_cpp_4::model::params::LlamaModelParams;
use llama_cpp_4::model::LlamaModel;

fn main() -> Result<(), String> {
    let path = env::args()
        .nth(1)
        .ok_or_else(|| "usage: metal_quit_smoke <model.gguf> <drop|leak>".to_string())?;
    let mode = env::args()
        .nth(2)
        .ok_or_else(|| "usage: metal_quit_smoke <model.gguf> <drop|leak>".to_string())?;
    if !Path::new(&path).is_file() {
        return Err(format!("file not found: {path}"));
    }

    let backend = LlamaBackend::init().map_err(|e| format!("backend init: {e}"))?;
    let model = LlamaModel::load_from_file(&backend, &path, &LlamaModelParams::default())
        .map_err(|e| format!("load model: {e}"))?;
    eprintln!("loaded {path} (mode={mode})");

    match mode.as_str() {
        "drop" => {
            // Match Maguna quit's weight teardown: free buffers, leave backend for
            // process teardown (`prepare_for_exit` also joins the decode thread first).
            drop(model);
            std::mem::forget(backend);
            eprintln!("dropped model; process::exit(0)");
            std::process::exit(0);
        }
        "leak" => {
            std::mem::forget(model);
            std::mem::forget(backend);
            eprintln!("leaked; process::exit(0) — expect Metal abort");
            std::process::exit(0);
        }
        other => Err(format!("unknown mode {other:?}; use drop or leak")),
    }
}
