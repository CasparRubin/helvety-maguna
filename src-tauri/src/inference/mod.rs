//! On-device inference uses [`llama-cpp-4`](https://crates.io/crates/llama-cpp-4) (llama.cpp)
//! via the `llama` Cargo feature (enabled by default).
//! `stream_chat_completion` is the narrow hook if alternate engines are added later.

#[cfg(feature = "llama")]
mod llama_impl;

#[cfg(feature = "llama")]
pub use llama_impl::stream_chat_completion;
