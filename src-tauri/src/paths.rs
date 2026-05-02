use std::path::PathBuf;

use tauri::Manager;

use crate::error::{MagunaError, MagunaResult};

pub fn maguna_root(app: &tauri::AppHandle) -> MagunaResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| MagunaError::msg(e.to_string()))?;
    Ok(base.join("maguna"))
}

pub fn models_dir(app: &tauri::AppHandle) -> MagunaResult<PathBuf> {
    Ok(maguna_root(app)?.join("models"))
}

pub fn tmp_dir(app: &tauri::AppHandle) -> MagunaResult<PathBuf> {
    Ok(maguna_root(app)?.join("tmp"))
}
