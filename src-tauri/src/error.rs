use thiserror::Error;

#[allow(dead_code)]
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
    #[error("Inference backend was not compiled in. Build with the `llama` feature (e.g. `bun run dev:llama`) and LLVM/libclang; see README.")]
    NoInferenceBackend,
    #[error("No model is loaded. Install a GGUF, set a default in Model library, or choose an installed model on the mode page.")]
    NoModelLoaded,
    #[error("Model not found: {0}")]
    ModelNotFound(String),
    #[error("Not enough free disk space")]
    DiskSpace,
}

impl MagunaError {
    pub fn msg(s: impl Into<String>) -> Self {
        MagunaError::Msg(s.into())
    }
}

pub type MagunaResult<T> = std::result::Result<T, MagunaError>;
