//! Local inference. Today this is implemented with llama.cpp behind the `llama` Cargo feature.
//! A small `InferenceEngine`-style split (`stream_chat_completion`) keeps room for alternate
//! backends (for example mobile Metal stacks) without rewriting the React shell.

#[cfg(feature = "llama")]
mod llama_impl;

#[cfg(feature = "llama")]
pub use llama_impl::stream_chat_completion;
