use thiserror::Error;

#[derive(Debug, Error)]
pub enum MagunaError {
    #[error("{0}")]
    Msg(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("HTTP error: {0}")]
    Http(String),
    #[error("Catalog error: {0}")]
    Catalog(String),
    /// Only used in `run_task_inner` when the `llama` feature is disabled.
    #[cfg_attr(feature = "llama", allow(dead_code))]
    #[error("This build cannot run models on your device. Use a normal release of the app, or see the README if you compile from source.")]
    NoInferenceBackend,
    /// Only constructed when the `llama` feature is enabled (`loaded_for_inference`).
    #[cfg_attr(not(feature = "llama"), allow(dead_code))]
    #[error("No model is loaded. Install a GGUF, set a default in Model library, or choose an installed model on the mode page.")]
    NoModelLoaded,
    #[error("Model not found: {0}")]
    ModelNotFound(String),
}

impl MagunaError {
    pub fn msg(s: impl Into<String>) -> Self {
        MagunaError::Msg(s.into())
    }
}

pub type MagunaResult<T> = std::result::Result<T, MagunaError>;
