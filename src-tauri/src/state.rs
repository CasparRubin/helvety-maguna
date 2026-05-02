use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[cfg(feature = "llama")]
use crate::chat_template::ChatTemplate;
use crate::error::{MagunaError, MagunaResult};
use crate::paths;

#[derive(Default, Serialize, Deserialize, Clone)]
pub(crate) struct PersistedSettings {
    #[serde(default)]
    active_model_id: Option<String>,
    /// Per-mode GGUF id override; modes not listed use `active_model_id` as fallback.
    #[serde(default)]
    mode_model_ids: HashMap<String, String>,
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
    settings: Mutex<PersistedSettings>,
    #[cfg(feature = "llama")]
    pub loaded: Mutex<Option<(String, ChatTemplate, Arc<llama_cpp::LlamaModel>)>>,
}

impl AppState {
    pub fn new(app: &tauri::AppHandle) -> Self {
        let s = load_settings(app);
        Self {
            cancel_infer: Arc::new(AtomicBool::new(false)),
            settings: Mutex::new(s),
            #[cfg(feature = "llama")]
            loaded: Mutex::new(None),
        }
    }

    fn persist(&self, app: &tauri::AppHandle) -> MagunaResult<()> {
        let s = self.settings.lock().clone();
        save_settings(app, &s)
    }

    pub fn get_active_id(&self) -> Option<String> {
        self.settings.lock().active_model_id.clone()
    }

    pub fn set_active_id(&self, app: &tauri::AppHandle, id: Option<String>) -> MagunaResult<()> {
        self.settings.lock().active_model_id = id;
        self.persist(app)
    }

    /// GGUF id to use for this mode: per-mode override, else global default.
    pub fn resolve_model_for_mode(&self, mode_id: &str) -> Option<String> {
        let s = self.settings.lock();
        s.mode_model_ids
            .get(mode_id)
            .cloned()
            .or_else(|| s.active_model_id.clone())
    }

    pub fn mode_model_override(&self, mode_id: &str) -> Option<String> {
        self.settings.lock().mode_model_ids.get(mode_id).cloned()
    }

    pub fn set_mode_model_override(
        &self,
        app: &tauri::AppHandle,
        mode_id: String,
        model_id: String,
    ) -> MagunaResult<()> {
        self.settings
            .lock()
            .mode_model_ids
            .insert(mode_id, model_id);
        self.persist(app)
    }

    pub fn clear_mode_model_override(
        &self,
        app: &tauri::AppHandle,
        mode_id: &str,
    ) -> MagunaResult<()> {
        self.settings.lock().mode_model_ids.remove(mode_id);
        self.persist(app)
    }

    /// After deleting a GGUF, drop it from default and every mode binding.
    pub fn remove_model_from_all_bindings(
        &self,
        app: &tauri::AppHandle,
        model_id: &str,
    ) -> MagunaResult<()> {
        let mut s = self.settings.lock();
        if s.active_model_id.as_deref() == Some(model_id) {
            s.active_model_id = None;
        }
        s.mode_model_ids.retain(|_, v| v != model_id);
        drop(s);
        self.persist(app)
    }

    #[cfg(feature = "llama")]
    pub fn reset_cancel(&self) {
        self.cancel_infer.store(false, Ordering::SeqCst);
    }

    pub fn cancel_generation(&self) {
        self.cancel_infer.store(true, Ordering::SeqCst);
    }

    #[cfg(feature = "llama")]
    pub fn unload_model(&self) {
        *self.loaded.lock() = None;
    }

    #[cfg(feature = "llama")]
    pub fn loaded_model_id(&self) -> Option<String> {
        self.loaded.lock().as_ref().map(|(id, _, _)| id.clone())
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

#[cfg(test)]
mod persist_tests {
    use super::PersistedSettings;

    #[test]
    fn persisted_settings_roundtrip_with_mode_map() {
        let json = r#"{"active_model_id":"global-1","mode_model_ids":{"spelling":"spell-1","translate":"tr-1"}}"#;
        let s: PersistedSettings = serde_json::from_str(json).unwrap();
        let out = serde_json::to_string(&s).unwrap();
        let back: PersistedSettings = serde_json::from_str(&out).unwrap();
        assert_eq!(back.active_model_id, Some("global-1".into()));
        assert_eq!(
            back.mode_model_ids.get("spelling").map(String::as_str),
            Some("spell-1")
        );
        assert_eq!(
            back.mode_model_ids.get("translate").map(String::as_str),
            Some("tr-1")
        );
    }

    #[test]
    fn persisted_settings_default_empty_mode_map() {
        let j = r#"{"active_model_id":null}"#;
        let s: PersistedSettings = serde_json::from_str(j).unwrap();
        assert!(s.mode_model_ids.is_empty());
    }
}
