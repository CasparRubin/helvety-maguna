//! On-device runs use llama.cpp via the `llama` Cargo feature (enabled by default).
//! `stream_chat_completion` is the narrow hook if alternate engines are added later.

#[cfg(feature = "llama")]
mod llama_impl;

#[cfg(feature = "llama")]
pub use llama_impl::stream_chat_completion;
