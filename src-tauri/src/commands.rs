use tauri::{AppHandle, Emitter, State};

use std::collections::HashSet;

use crate::catalog::{self, CatalogModel};
use crate::download;
#[cfg(not(feature = "llama"))]
use crate::error::MagunaError;
#[cfg(feature = "llama")]
use crate::inference;
use crate::modes::{self, ModeDefinition};
use crate::state::AppState;
use crate::storage::{self, InstalledModelDto};

#[derive(serde::Serialize)]
pub struct InferenceBackendInfo {
    /// True when this binary was built with `--features llama` (requires LLVM at compile time).
    pub llama_backend_compiled: bool,
    pub dev_hint: String,
}

#[tauri::command]
pub fn inference_backend_info() -> InferenceBackendInfo {
    if cfg!(feature = "llama") {
        InferenceBackendInfo {
            llama_backend_compiled: true,
            dev_hint: "This build includes on-device GGUF inference (llama.cpp) for Modes.".into(),
        }
    } else {
        InferenceBackendInfo {
            llama_backend_compiled: false,
            dev_hint: "Modes (local inference) need llama.cpp. On Windows: winget install LLVM.LLVM, then npm run dev:llama:win (or set LIBCLANG_PATH to LLVM\\bin and npm run dev:llama). See docs/BUILD.md.".into(),
        }
    }
}

#[tauri::command]
pub fn get_catalog() -> Result<Vec<CatalogModel>, String> {
    catalog::load_catalog()
        .map(|c| c.models)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_installed_models(app: AppHandle) -> Result<Vec<InstalledModelDto>, String> {
    storage::list_installed(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_active_model_id(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.get_active_id())
}

#[tauri::command]
pub async fn set_active_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    let _ = storage::resolve_gguf_path(&app, &model_id).map_err(|e| e.to_string())?;
    #[cfg(feature = "llama")]
    {
        state.unload_model();
        state
            .load_model_for_id(&app, &model_id)
            .map_err(|e| e.to_string())?;
    }
    state
        .set_active_id(&app, Some(model_id))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    if state.get_active_id().as_deref() == Some(model_id.as_str()) {
        state.unload_model();
        state.set_active_id(&app, None).map_err(|e| e.to_string())?;
    }
    storage::delete_installed(&app, &model_id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn download_model(app: AppHandle, catalog_id: String) -> Result<(), String> {
    let entry = catalog::find_catalog_model(&catalog_id).map_err(|e| e.to_string())?;
    let app_c = app.clone();
    let id = entry.id.clone();
    let partial = download::download_catalog_model(&app, &entry, move |received, total| {
        let _ = app_c.emit(
            "download-progress",
            serde_json::json!({
                "model_id": id,
                "received": received,
                "total": total,
            }),
        );
    })
    .await
    .map_err(|e| e.to_string())?;
    storage::install_from_catalog(&app, &entry, partial).map_err(|e| e.to_string())?;
    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "model_id": entry.id,
            "received": entry.size_bytes,
            "total": entry.size_bytes,
        }),
    );
    Ok(())
}

#[tauri::command]
pub async fn import_gguf(
    app: AppHandle,
    source_path: String,
    display_name: String,
) -> Result<String, String> {
    let src = std::path::PathBuf::from(source_path);
    if !src.is_file() || src.extension().and_then(|s| s.to_str()) != Some("gguf") {
        return Err("Select a .gguf file".to_string());
    }
    let id = format!(
        "import-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis()
    );
    let dir = crate::paths::models_dir(&app)
        .map_err(|e| e.to_string())?
        .join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join("model.gguf");
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    let manifest = storage::InstalledManifest {
        id: id.clone(),
        display_name,
        gguf_path: dest,
        sha256: None,
        source_url: None,
        chat_template: String::new(),
    };
    storage::write_manifest(&dir, &manifest).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn cancel_generation(state: State<'_, AppState>) -> Result<(), String> {
    state.cancel_generation();
    Ok(())
}

fn assert_en_de_locale(locale: &str) -> Result<(), String> {
    if locale == "en" || locale == "de" {
        return Ok(());
    }
    Err("Locale must be \"en\" or \"de\".".into())
}

fn assert_en_de_translate(from: &str, to: &str) -> Result<(), String> {
    if from != "en" && from != "de" {
        return Err("Source language must be \"en\" or \"de\".".into());
    }
    if to != "en" && to != "de" {
        return Err("Target language must be \"en\" or \"de\".".into());
    }
    if from == to {
        return Err("Source and target must differ.".into());
    }
    Ok(())
}

pub(crate) fn validate_modes(modes: &[ModeDefinition]) -> Result<(), String> {
    let mut seen = HashSet::new();
    for m in modes {
        if !seen.insert(m.id.as_str()) {
            return Err(format!("Duplicate mode id: {}", m.id));
        }
        if !m.user_message_template.contains("{{input}}") {
            return Err(format!(
                "Mode \"{}\" must include {{input}} in the user message template.",
                m.name
            ));
        }
        if m.max_tokens < 64 || m.max_tokens > 8192 {
            return Err(format!(
                "Mode \"{}\" max_tokens must be between 64 and 8192.",
                m.name
            ));
        }
    }
    let ids: HashSet<_> = modes.iter().map(|m| m.id.as_str()).collect();
    if !ids.contains("spelling") || !ids.contains("translate") {
        return Err("Modes must include built-in ids \"spelling\" and \"translate\".".into());
    }
    Ok(())
}

#[tauri::command]
pub fn get_modes(app: AppHandle) -> Result<Vec<ModeDefinition>, String> {
    modes::load_modes(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_modes(app: AppHandle, mut modes: Vec<ModeDefinition>) -> Result<(), String> {
    for m in &mut modes {
        if m.id == "spelling" || m.id == "translate" {
            m.builtin = true;
        }
    }
    validate_modes(&modes)?;
    modes::save_modes(&app, &modes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_mode(app: AppHandle, mode_id: String) -> Result<(), String> {
    if mode_id == "spelling" || mode_id == "translate" {
        return Err("Built-in modes cannot be deleted.".into());
    }
    let mut list = modes::load_modes(&app).map_err(|e| e.to_string())?;
    list.retain(|m| m.id != mode_id);
    validate_modes(&list)?;
    modes::save_modes(&app, &list).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reset_mode_to_default(app: AppHandle, mode_id: String) -> Result<(), String> {
    modes::reset_builtin(&app, &mode_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn run_mode(
    app: AppHandle,
    state: State<'_, AppState>,
    mode_id: String,
    input: String,
    locale: Option<String>,
    from_lang: Option<String>,
    to_lang: Option<String>,
) -> Result<(), String> {
    let list = modes::load_modes(&app).map_err(|e| e.to_string())?;
    let mode = list
        .into_iter()
        .find(|m| m.id == mode_id)
        .ok_or_else(|| format!("Unknown mode: {mode_id}"))?;

    let tpl = &mode.user_message_template;
    if tpl.contains("{{locale}}") {
        let loc = locale
            .as_deref()
            .ok_or_else(|| "Locale is required for this mode.".to_string())?;
        assert_en_de_locale(loc)?;
    }
    if tpl.contains("{{from}}") || tpl.contains("{{to}}") {
        let f = from_lang
            .as_deref()
            .ok_or_else(|| "Source language is required for this mode.".to_string())?;
        let t = to_lang
            .as_deref()
            .ok_or_else(|| "Target language is required for this mode.".to_string())?;
        assert_en_de_translate(f, t)?;
    }

    let user = modes::build_user_message(
        tpl,
        &input,
        locale.as_deref(),
        from_lang.as_deref(),
        to_lang.as_deref(),
    );
    run_task_inner(
        &app,
        &state,
        &mode.system_prompt,
        &user,
        mode.max_tokens as usize,
    )
    .await
}

async fn run_task_inner(
    app: &AppHandle,
    state: &State<'_, AppState>,
    system: &str,
    user: &str,
    max_tokens: usize,
) -> Result<(), String> {
    #[cfg(not(feature = "llama"))]
    {
        let _ = (app, state, system, user, max_tokens);
        Err(MagunaError::NoInferenceBackend.to_string())
    }

    #[cfg(feature = "llama")]
    {
        state.reset_cancel();
        let (model, template) = state.loaded_for_inference().map_err(|e| e.to_string())?;
        let prompt = template.format_prompt(system, user);
        let cancel = state.cancel_infer.clone();
        let app = app.clone();
        std::thread::spawn(move || {
            if let Err(e) =
                inference::stream_chat_completion(&app, &model, prompt, max_tokens, &cancel)
            {
                let _ = app.emit("inference-error", e);
            }
        });
        Ok(())
    }
}

#[cfg(test)]
mod validate_tests {
    use super::validate_modes;
    use crate::modes::{self, ModeDefinition};

    fn mode(id: &str, name: &str, tpl: &str, max: u32) -> ModeDefinition {
        ModeDefinition {
            id: id.into(),
            name: name.into(),
            system_prompt: String::new(),
            user_message_template: tpl.into(),
            max_tokens: max,
            builtin: false,
        }
    }

    fn builtins_plus(extra: Vec<ModeDefinition>) -> Vec<ModeDefinition> {
        let mut v = modes::default_modes();
        v.extend(extra);
        v
    }

    #[test]
    fn validate_accepts_valid_custom() {
        let v = builtins_plus(vec![mode("custom", "Custom", "{{input}}", 128)]);
        assert!(validate_modes(&v).is_ok());
    }

    #[test]
    fn validate_rejects_duplicate_id() {
        let v = builtins_plus(vec![
            mode("x", "A", "{{input}}", 128),
            mode("x", "B", "{{input}}", 256),
        ]);
        assert!(validate_modes(&v).is_err());
    }

    #[test]
    fn validate_rejects_missing_input_placeholder() {
        let v = builtins_plus(vec![mode("x", "Bad", "hello", 128)]);
        assert!(validate_modes(&v).is_err());
    }

    #[test]
    fn validate_rejects_low_max_tokens() {
        let v = builtins_plus(vec![mode("x", "Bad", "{{input}}", 32)]);
        assert!(validate_modes(&v).is_err());
    }

    #[test]
    fn validate_requires_spelling_and_translate() {
        let v = vec![mode("a", "Only", "{{input}}", 128)];
        assert!(validate_modes(&v).is_err());
    }
}
