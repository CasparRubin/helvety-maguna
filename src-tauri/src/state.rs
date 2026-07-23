use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

#[cfg(feature = "llama")]
use crate::chat_template::ChatTemplate;
use crate::error::{MagunaError, MagunaResult};
use crate::paths;

fn default_guardrails_enabled() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct PersistedSettings {
    #[serde(default)]
    pub(crate) active_model_id: Option<String>,
    /// Per-mode GGUF id override; modes not listed use `active_model_id` as fallback.
    #[serde(default)]
    pub(crate) mode_model_ids: HashMap<String, String>,
    /// Serialized for backwards compatibility; [`load_settings`] and [`AppState::set_guardrails`] force `true` at runtime.
    #[serde(default = "default_guardrails_enabled")]
    pub(crate) guardrails_enabled: bool,
    #[serde(default)]
    pub(crate) guardrails_custom_text: Option<String>,
    /// When true (`Thinking is on` in the UI), Qwen / Gemma 4 / GLM-4.7 Flash prompts allow
    /// chain-of-thought; default is polished copy (`Thinking is off`).
    /// DeepSeek-R1 / GLM-Z1 templates keep reasoning prose on regardless of this flag.
    #[serde(default)]
    pub(crate) enable_model_thinking: bool,
}

impl Default for PersistedSettings {
    fn default() -> Self {
        Self {
            active_model_id: None,
            mode_model_ids: HashMap::new(),
            guardrails_enabled: true,
            guardrails_custom_text: None,
            enable_model_thinking: false,
        }
    }
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
    let mut s: PersistedSettings = serde_json::from_str(&raw).unwrap_or_default();
    // Product policy: guardrails cannot be turned off; normalize legacy `false` on disk.
    s.guardrails_enabled = true;
    s
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
    pub llama_backend: Arc<llama_cpp_4::llama_backend::LlamaBackend>,
    #[cfg(feature = "llama")]
    pub loaded: Mutex<Option<(String, ChatTemplate, Arc<llama_cpp_4::model::LlamaModel>)>>,
    /// Multi-turn Chat KV reuse; invalidated on model unload, New chat, or cancel.
    #[cfg(feature = "llama")]
    pub chat_kv: Arc<Mutex<Option<crate::inference::ChatKvSession>>>,
}

impl AppState {
    pub fn new(app: &tauri::AppHandle) -> Self {
        let s = load_settings(app);
        #[cfg(feature = "llama")]
        let llama_backend = Arc::new(
            llama_cpp_4::llama_backend::LlamaBackend::init()
                .expect("llama.cpp backend init failed"),
        );
        Self {
            cancel_infer: Arc::new(AtomicBool::new(false)),
            settings: Mutex::new(s),
            #[cfg(feature = "llama")]
            llama_backend,
            #[cfg(feature = "llama")]
            loaded: Mutex::new(None),
            #[cfg(feature = "llama")]
            chat_kv: Arc::new(Mutex::new(None)),
        }
    }

    fn persist(&self, app: &tauri::AppHandle) -> MagunaResult<()> {
        let s = self.settings.lock().clone();
        save_settings(app, &s)
    }

    pub fn get_active_id(&self) -> Option<String> {
        self.settings.lock().active_model_id.clone()
    }

    pub(crate) fn persisted_snapshot(&self) -> PersistedSettings {
        self.settings.lock().clone()
    }

    pub(crate) fn set_guardrails(
        &self,
        app: &tauri::AppHandle,
        custom_text: Option<String>,
    ) -> MagunaResult<()> {
        let mut s = self.settings.lock();
        s.guardrails_enabled = true;
        s.guardrails_custom_text = custom_text;
        drop(s);
        self.persist(app)
    }

    pub(crate) fn enable_model_thinking(&self) -> bool {
        self.settings.lock().enable_model_thinking
    }

    pub(crate) fn set_enable_model_thinking(
        &self,
        app: &tauri::AppHandle,
        enabled: bool,
    ) -> MagunaResult<()> {
        self.settings.lock().enable_model_thinking = enabled;
        // Prompt framing changes; drop Chat KV so the next turn is not mixed with the old prefix.
        #[cfg(feature = "llama")]
        self.invalidate_chat_kv();
        self.persist(app)
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
    pub fn invalidate_chat_kv(&self) {
        *self.chat_kv.lock() = None;
    }

    #[cfg(feature = "llama")]
    pub fn unload_model(&self) {
        self.invalidate_chat_kv();
        *self.loaded.lock() = None;
    }

    #[cfg(feature = "llama")]
    pub fn loaded_model_id(&self) -> Option<String> {
        self.loaded.lock().as_ref().map(|(id, _, _)| id.clone())
    }

    #[cfg(feature = "llama")]
    pub fn load_model_for_id(&self, app: &tauri::AppHandle, model_id: &str) -> MagunaResult<()> {
        use llama_cpp_4::model::params::LlamaModelParams;

        let dir = paths::models_dir(app)?.join(model_id);
        let manifest = crate::storage::read_manifest(&dir)?;
        let template = ChatTemplate::resolve(&manifest.chat_template, model_id);
        let path = crate::storage::effective_gguf_path(&dir, &manifest)?;
        let model = llama_cpp_4::model::LlamaModel::load_from_file(
            self.llama_backend.as_ref(),
            path,
            &LlamaModelParams::default(),
        )
        .map_err(|e| MagunaError::msg(format!("load model: {e}")))?;
        *self.loaded.lock() = Some((model_id.to_string(), template, Arc::new(model)));
        Ok(())
    }

    #[cfg(feature = "llama")]
    pub fn loaded_for_inference(
        &self,
    ) -> MagunaResult<(Arc<llama_cpp_4::model::LlamaModel>, ChatTemplate)> {
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

    /// Raw JSON serde roundtrip preserves `guardrails_enabled` as written.
    /// At runtime, [`load_settings`] forces `guardrails_enabled` to `true` when reading the file.
    #[test]
    fn persisted_settings_roundtrip_with_mode_map() {
        let json = r#"{"active_model_id":"global-1","mode_model_ids":{"correction-de":"spell-1","translate-de-en":"tr-1"},"guardrails_enabled":false,"guardrails_custom_text":"x"}"#;
        let s: PersistedSettings = serde_json::from_str(json).unwrap();
        let out = serde_json::to_string(&s).unwrap();
        let back: PersistedSettings = serde_json::from_str(&out).unwrap();
        assert_eq!(back.active_model_id, Some("global-1".into()));
        assert_eq!(
            back.mode_model_ids.get("correction-de").map(String::as_str),
            Some("spell-1")
        );
        assert_eq!(
            back.mode_model_ids
                .get("translate-de-en")
                .map(String::as_str),
            Some("tr-1")
        );
        assert!(!back.guardrails_enabled);
        assert_eq!(back.guardrails_custom_text.as_deref(), Some("x"));
        assert!(!back.enable_model_thinking);
    }

    #[test]
    fn persisted_settings_default_empty_mode_map() {
        let j = r#"{"active_model_id":null}"#;
        let s: PersistedSettings = serde_json::from_str(j).unwrap();
        assert!(s.mode_model_ids.is_empty());
        assert!(s.guardrails_enabled);
        assert!(s.guardrails_custom_text.is_none());
        assert!(!s.enable_model_thinking);
    }

    #[test]
    fn persisted_settings_empty_json_roundtrip() {
        let s: PersistedSettings = serde_json::from_str("{}").unwrap();
        assert!(s.active_model_id.is_none());
        assert!(s.mode_model_ids.is_empty());
        assert!(s.guardrails_enabled);
        assert!(s.guardrails_custom_text.is_none());
        assert!(!s.enable_model_thinking);
        let out = serde_json::to_string(&s).unwrap();
        let back: PersistedSettings = serde_json::from_str(&out).unwrap();
        assert!(back.active_model_id.is_none());
        assert!(back.mode_model_ids.is_empty());
        assert!(back.guardrails_enabled);
        assert!(back.guardrails_custom_text.is_none());
        assert!(!back.enable_model_thinking);
    }

    #[test]
    fn persisted_settings_legacy_json_defaults_guardrails_on() {
        let j = r#"{"active_model_id":null,"mode_model_ids":{}}"#;
        let s: PersistedSettings = serde_json::from_str(j).unwrap();
        assert!(s.guardrails_enabled);
        assert!(s.guardrails_custom_text.is_none());
        assert!(!s.enable_model_thinking);
    }

    #[test]
    fn persisted_settings_enable_model_thinking_roundtrip() {
        let json = r#"{"enable_model_thinking":true}"#;
        let s: PersistedSettings = serde_json::from_str(json).unwrap();
        assert!(s.enable_model_thinking);
        let out = serde_json::to_string(&s).unwrap();
        assert!(out.contains("enable_model_thinking"));
        let back: PersistedSettings = serde_json::from_str(&out).unwrap();
        assert!(back.enable_model_thinking);
    }
}
