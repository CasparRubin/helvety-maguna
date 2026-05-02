use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[cfg(feature = "llama")]
use crate::chat_template::ChatTemplate;
use crate::error::{MagunaError, MagunaResult};
use crate::paths;

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct PersistedSettings {
    #[serde(default)]
    active_model_id: Option<String>,
}

fn settings_path(app: &tauri::AppHandle) -> MagunaResult<std::path::PathBuf> {
    Ok(paths::maguna_root(app)?.join("settings.json"))
}

pub fn load_settings(app: &tauri::AppHandle) -> PersistedSettings {
    let Ok(path) = settings_path(app) else {
        return PersistedSettings::default();
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return PersistedSettings::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_settings(app: &tauri::AppHandle, s: &PersistedSettings) -> MagunaResult<()> {
    let root = paths::maguna_root(app)?;
    std::fs::create_dir_all(&root)?;
    let path = settings_path(app)?;
    std::fs::write(
        path,
        serde_json::to_string_pretty(s).map_err(|e| MagunaError::msg(e.to_string()))?,
    )?;
    Ok(())
}

pub struct AppState {
    pub cancel_infer: Arc<AtomicBool>,
    pub active_model_id: Mutex<Option<String>>,
    #[cfg(feature = "llama")]
    pub loaded: Mutex<Option<(String, ChatTemplate, Arc<llama_cpp::LlamaModel>)>>,
}

impl AppState {
    pub fn new(app: &tauri::AppHandle) -> Self {
        let s = load_settings(app);
        Self {
            cancel_infer: Arc::new(AtomicBool::new(false)),
            active_model_id: Mutex::new(s.active_model_id),
            #[cfg(feature = "llama")]
            loaded: Mutex::new(None),
        }
    }

    pub fn get_active_id(&self) -> Option<String> {
        self.active_model_id.lock().clone()
    }

    pub fn set_active_id(&self, app: &tauri::AppHandle, id: Option<String>) -> MagunaResult<()> {
        *self.active_model_id.lock() = id.clone();
        save_settings(
            app,
            &PersistedSettings {
                active_model_id: id,
            },
        )
    }

    #[cfg(feature = "llama")]
    pub fn reset_cancel(&self) {
        self.cancel_infer.store(false, Ordering::SeqCst);
    }

    pub fn cancel_generation(&self) {
        self.cancel_infer.store(true, Ordering::SeqCst);
    }

    pub fn unload_model(&self) {
        #[cfg(feature = "llama")]
        {
            *self.loaded.lock() = None;
        }
    }

    #[cfg(feature = "llama")]
    pub fn load_model_for_id(&self, app: &tauri::AppHandle, model_id: &str) -> MagunaResult<()> {
        let dir = paths::models_dir(app)?.join(model_id);
        let manifest = crate::storage::read_manifest(&dir)?;
        let template = ChatTemplate::resolve(&manifest.chat_template, model_id);
        let path = manifest.gguf_path.clone();
        if !path.exists() {
            return Err(MagunaError::msg("GGUF file missing on disk"));
        }
        let params = llama_cpp::LlamaParams::default();
        let model = llama_cpp::LlamaModel::load_from_file(path, params)
            .map_err(|e| MagunaError::msg(format!("load model: {e}")))?;
        *self.loaded.lock() = Some((model_id.to_string(), template, Arc::new(model)));
        Ok(())
    }

    #[cfg(feature = "llama")]
    pub fn loaded_for_inference(&self) -> MagunaResult<(Arc<llama_cpp::LlamaModel>, ChatTemplate)> {
        self.loaded
            .lock()
            .as_ref()
            .map(|(_, t, m)| (Arc::clone(m), *t))
            .ok_or(MagunaError::NoModelLoaded)
    }
}
