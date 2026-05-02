use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

use std::collections::HashSet;

use crate::catalog::{self, CatalogModel};
use crate::chat_template::manifest_template_key_from_hints;
use crate::download;
#[cfg(not(feature = "llama"))]
use crate::error::MagunaError;
#[cfg(feature = "llama")]
use crate::inference;
use crate::modes::{self, ModeDefinition, PromptLayout};
use crate::paths;
use crate::state::AppState;
use crate::storage::{self, InstalledModelDto};

#[derive(serde::Serialize)]
pub struct ModeModelBinding {
    pub effective_model_id: Option<String>,
    pub override_model_id: Option<String>,
}

/// When at least one model is installed but there is no valid default, set `active_model_id`
/// to `prefer_id` if it is installed, otherwise the first installed model (name order).
pub(crate) fn sync_default_model_from_installs(
    app: &AppHandle,
    state: &AppState,
    prefer_id: Option<&str>,
) -> Result<(), String> {
    let installed = storage::list_installed(app).map_err(|e| e.to_string())?;
    if installed.is_empty() {
        return Ok(());
    }
    let id_set: HashSet<&str> = installed.iter().map(|m| m.id.as_str()).collect();
    let active_ok = state
        .get_active_id()
        .as_ref()
        .is_some_and(|id| id_set.contains(id.as_str()));
    if active_ok {
        return Ok(());
    }
    let chosen = prefer_id
        .filter(|id| id_set.contains(id))
        .unwrap_or_else(|| installed.first().unwrap().id.as_str());
    state
        .set_active_id(app, Some(chosen.to_string()))
        .map_err(|e| e.to_string())
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

/// Opens the resolved models directory in File Explorer / Finder / the system file manager.
#[tauri::command]
pub fn open_models_install_folder(app: AppHandle) -> Result<(), String> {
    let dir = crate::paths::models_dir(&app).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.to_string_lossy().into_owned();
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_mode_model_binding(
    app: AppHandle,
    state: State<'_, AppState>,
    mode_id: String,
) -> Result<ModeModelBinding, String> {
    let list = modes::load_modes(&app).map_err(|e| e.to_string())?;
    if !list.iter().any(|m| m.id == mode_id) {
        return Err(format!("Unknown mode: {mode_id}"));
    }
    Ok(ModeModelBinding {
        effective_model_id: state.resolve_model_for_mode(&mode_id),
        override_model_id: state.mode_model_override(&mode_id),
    })
}

#[tauri::command]
pub async fn set_mode_model_override(
    app: AppHandle,
    state: State<'_, AppState>,
    mode_id: String,
    model_id: String,
) -> Result<(), String> {
    let list = modes::load_modes(&app).map_err(|e| e.to_string())?;
    if !list.iter().any(|m| m.id == mode_id) {
        return Err(format!("Unknown mode: {mode_id}"));
    }
    let _ = storage::resolve_gguf_path(&app, &model_id).map_err(|e| e.to_string())?;
    state
        .set_mode_model_override(&app, mode_id, model_id.clone())
        .map_err(|e| e.to_string())?;
    #[cfg(feature = "llama")]
    {
        state.unload_model();
        state
            .load_model_for_id(&app, &model_id)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn clear_mode_model_override(
    app: AppHandle,
    state: State<'_, AppState>,
    mode_id: String,
) -> Result<(), String> {
    let list = modes::load_modes(&app).map_err(|e| e.to_string())?;
    if !list.iter().any(|m| m.id == mode_id) {
        return Err(format!("Unknown mode: {mode_id}"));
    }
    state
        .clear_mode_model_override(&app, &mode_id)
        .map_err(|e| e.to_string())?;
    #[cfg(feature = "llama")]
    {
        state.unload_model();
        if let Some(id) = state.resolve_model_for_mode(&mode_id) {
            state
                .load_model_for_id(&app, &id)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
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
    #[cfg(feature = "llama")]
    {
        if state.loaded_model_id().as_deref() == Some(model_id.as_str()) {
            state.unload_model();
        }
    }
    state
        .remove_model_from_all_bindings(&app, &model_id)
        .map_err(|e| e.to_string())?;
    storage::delete_installed(&app, &model_id).map_err(|e| e.to_string())?;
    sync_default_model_from_installs(&app, &state, None)?;
    Ok(())
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    state: State<'_, AppState>,
    catalog_id: String,
) -> Result<(), String> {
    let entry = catalog::find_catalog_model(&catalog_id).map_err(|e| e.to_string())?;
    let app_c = app.clone();
    let id = entry.id.clone();
    let partial = download::download_catalog_model(&app, &entry, move |received, total| {
        let _ = app_c.emit(
            "download-progress",
            serde_json::json!({
                "model_id": id,
                "phase": "downloading",
                "received": received,
                "total": total,
            }),
        );
    })
    .await
    .map_err(|e| e.to_string())?;
    let staging_partial_path = paths::tmp_dir(&app)
        .map_err(|e| e.to_string())?
        .join(paths::catalog_download_partial_filename(&entry.id));
    // Network stream is done; rename or copy into `Models/` can take a long time (especially
    // across volumes). Tell the UI so users do not assume it hung.
    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "model_id": &entry.id,
            "phase": "installing",
            "received": entry.size_bytes,
            "total": entry.size_bytes,
        }),
    );
    if let Err(e) = storage::install_from_catalog(&app, &entry, partial) {
        let _ = std::fs::remove_file(&staging_partial_path);
        return Err(e.to_string());
    }
    sync_default_model_from_installs(&app, &state, Some(entry.id.as_str()))?;
    Ok(())
}

#[tauri::command]
pub async fn import_gguf(
    app: AppHandle,
    state: State<'_, AppState>,
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
    let dest = dir.join(storage::weights_filename(&id));
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    let stem_hint = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .trim();
    let display_trim = display_name.trim();
    let chat_template = manifest_template_key_from_hints([stem_hint, display_trim]);
    let manifest = storage::InstalledManifest {
        id: id.clone(),
        display_name,
        gguf_path: dest,
        sha256: None,
        source_url: None,
        chat_template,
    };
    storage::write_manifest(&dir, &manifest).map_err(|e| e.to_string())?;
    sync_default_model_from_installs(&app, &state, Some(id.as_str()))?;
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
    Ok(())
}

pub(crate) fn validate_modes(modes: &[ModeDefinition]) -> Result<(), String> {
    let builtin_defaults = modes::default_modes();
    let required_builtin_ids: HashSet<&str> =
        builtin_defaults.iter().map(|m| m.id.as_str()).collect();
    let mut seen = HashSet::new();
    for m in modes {
        if !seen.insert(m.id.as_str()) {
            return Err(format!("Duplicate mode id: {}", m.id));
        }
        if let Some(required_layout) = modes::builtin_layout(&m.id) {
            if m.prompt_layout != required_layout {
                return Err(format!(
                    "Built-in mode \"{}\" must keep its prompt layout.",
                    m.name
                ));
            }
        }
        if m.max_tokens < 64 || m.max_tokens > 8192 {
            return Err(format!(
                "Mode \"{}\" max_tokens must be between 64 and 8192.",
                m.name
            ));
        }
    }
    let ids: HashSet<_> = modes.iter().map(|m| m.id.as_str()).collect();
    if !required_builtin_ids.iter().all(|id| ids.contains(id)) {
        return Err("Modes must include all required built-in modes.".into());
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
        if let Some(layout) = crate::modes::builtin_layout(&m.id) {
            m.builtin = true;
            m.prompt_layout = layout;
        }
    }
    validate_modes(&modes)?;
    modes::save_modes(&app, &modes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_mode(app: AppHandle, mode_id: String) -> Result<(), String> {
    if modes::is_builtin_mode_id(&mode_id) {
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

/// Caps how many new tokens the local engine may generate, from the formatted user turn.
/// Correction and translation outputs are usually similar in length to the input; this
/// scales with pasted text instead of a fixed UI preset (still clamped to backend limits).
fn inferred_generation_cap_from_user_turn(user_turn: &str) -> usize {
    const MIN: usize = 256;
    const MAX: usize = 8192;
    let chars = user_turn.chars().count();
    let est_in_tokens = (chars / 3).clamp(1, MAX);
    let cap = est_in_tokens.saturating_mul(2).saturating_add(384);
    cap.clamp(MIN, MAX)
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

    match mode.prompt_layout {
        PromptLayout::Locale => {
            let f = from_lang
                .as_deref()
                .or(locale.as_deref())
                .ok_or_else(|| "Input language is required for this mode.".to_string())?;
            assert_en_de_locale(f)?;
            let t = to_lang.as_deref().unwrap_or(f);
            assert_en_de_locale(t)?;
        }
        PromptLayout::Translate => {
            let f = from_lang
                .as_deref()
                .ok_or_else(|| "Input language is required for this mode.".to_string())?;
            let t = to_lang
                .as_deref()
                .ok_or_else(|| "Output language is required for this mode.".to_string())?;
            assert_en_de_translate(f, t)?;
        }
        PromptLayout::Plain => {}
    }

    let effective_model = state.resolve_model_for_mode(&mode_id).ok_or_else(|| {
        "No model selected for this mode. Set a default in Model library or pick an installed GGUF on this mode's page.".to_string()
    })?;
    let _ = storage::resolve_gguf_path(&app, &effective_model).map_err(|e| e.to_string())?;

    #[cfg(feature = "llama")]
    {
        state.reset_cancel();
        if state.loaded_model_id().as_deref() != Some(effective_model.as_str()) {
            state.unload_model();
            state
                .load_model_for_id(&app, &effective_model)
                .map_err(|e| e.to_string())?;
        }
    }

    let user = modes::format_user_turn(
        mode.prompt_layout,
        &input,
        locale.as_deref(),
        from_lang.as_deref(),
        to_lang.as_deref(),
    );
    let max_tokens = inferred_generation_cap_from_user_turn(&user);
    run_task_inner(&app, &state, &mode.system_prompt, &user, max_tokens).await
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
        let app_h = app.clone();
        // Inference uses its own current-thread Tokio driver for `llama_cpp` stream recv; keep it
        // off the main async runtime to avoid `block_in_place` + `spawn_blocking` deadlocks.
        std::thread::spawn(move || {
            if let Err(e) =
                inference::stream_chat_completion(&app_h, &model, prompt, max_tokens, &cancel)
            {
                let _ = app_h.emit("inference-error", e);
            }
        });
        Ok(())
    }
}

#[cfg(test)]
mod validate_tests {
    use super::validate_modes;
    use crate::modes::{self, ModeDefinition};

    fn mode(id: &str, name: &str, layout: modes::PromptLayout, max: u32) -> ModeDefinition {
        ModeDefinition {
            id: id.into(),
            name: name.into(),
            system_prompt: String::new(),
            prompt_layout: layout,
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
        let v = builtins_plus(vec![mode(
            "custom",
            "Custom",
            modes::PromptLayout::Plain,
            128,
        )]);
        assert!(validate_modes(&v).is_ok());
    }

    #[test]
    fn validate_rejects_duplicate_id() {
        let v = builtins_plus(vec![
            mode("x", "A", modes::PromptLayout::Plain, 128),
            mode("x", "B", modes::PromptLayout::Plain, 256),
        ]);
        assert!(validate_modes(&v).is_err());
    }

    #[test]
    fn validate_rejects_wrong_builtin_layout() {
        let mut v = modes::default_modes();
        if let Some(m) = v.iter_mut().find(|m| m.id == "correction-de") {
            m.prompt_layout = modes::PromptLayout::Plain;
        }
        assert!(validate_modes(&v).is_err());
    }

    #[test]
    fn validate_rejects_builtin_correction_with_locale_layout() {
        let mut v = modes::default_modes();
        if let Some(m) = v.iter_mut().find(|m| m.id == "correction-de") {
            m.prompt_layout = modes::PromptLayout::Locale;
        }
        assert!(validate_modes(&v).is_err());
    }

    #[test]
    fn validate_rejects_low_max_tokens() {
        let v = builtins_plus(vec![mode("x", "Bad", modes::PromptLayout::Plain, 32)]);
        assert!(validate_modes(&v).is_err());
    }

    #[test]
    fn validate_rejects_high_max_tokens() {
        let v = builtins_plus(vec![mode("x", "Bad", modes::PromptLayout::Plain, 9000)]);
        assert!(validate_modes(&v).is_err());
    }

    #[test]
    fn inferred_generation_cap_scales_and_clamps() {
        assert_eq!(super::inferred_generation_cap_from_user_turn(""), 386);
        assert_eq!(super::inferred_generation_cap_from_user_turn("hello"), 386);
        let long = "word ".repeat(5000);
        assert_eq!(super::inferred_generation_cap_from_user_turn(&long), 8192);
    }

    #[test]
    fn validate_accepts_max_tokens_boundaries() {
        let lo = builtins_plus(vec![mode("x", "Lo", modes::PromptLayout::Plain, 64)]);
        assert!(validate_modes(&lo).is_ok());
        let hi = builtins_plus(vec![mode("y", "Hi", modes::PromptLayout::Plain, 8192)]);
        assert!(validate_modes(&hi).is_ok());
    }

    #[test]
    fn validate_requires_all_builtins() {
        let v = vec![mode("a", "Only", modes::PromptLayout::Plain, 128)];
        assert!(validate_modes(&v).is_err());
    }
}
