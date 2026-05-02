use serde::{Deserialize, Serialize};

use crate::error::{MagunaError, MagunaResult};
use crate::paths;
use crate::prompts;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModeDefinition {
    pub id: String,
    pub name: String,
    /// User-owned except built-in `spelling` / `translate` factory defaults in `prompts.rs`.
    /// Empty is allowed (custom modes may rely only on the user template).
    pub system_prompt: String,
    /// Must contain `{{input}}`. Optional: `{{locale}}`, `{{from}}`, `{{to}}`.
    pub user_message_template: String,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub builtin: bool,
}

fn default_max_tokens() -> u32 {
    768
}

pub fn default_modes() -> Vec<ModeDefinition> {
    vec![
        ModeDefinition {
            id: "spelling".into(),
            name: "Correction".into(),
            system_prompt: prompts::SPELLING_SYSTEM.into(),
            user_message_template: prompts::SPELLING_USER_TEMPLATE.into(),
            max_tokens: 384,
            builtin: true,
        },
        ModeDefinition {
            id: "translate".into(),
            name: "Translate".into(),
            system_prompt: prompts::TRANSLATE_SYSTEM.into(),
            user_message_template: prompts::TRANSLATE_USER_TEMPLATE.into(),
            max_tokens: 1024,
            builtin: true,
        },
    ]
}

fn modes_path(app: &tauri::AppHandle) -> MagunaResult<std::path::PathBuf> {
    Ok(paths::maguna_root(app)?.join("modes.json"))
}

pub fn load_modes(app: &tauri::AppHandle) -> MagunaResult<Vec<ModeDefinition>> {
    let path = modes_path(app)?;
    if !path.exists() {
        let defaults = default_modes();
        save_modes(app, &defaults)?;
        return Ok(defaults);
    }
    let raw = std::fs::read_to_string(&path)?;
    let parsed: Result<Vec<ModeDefinition>, _> = serde_json::from_str(&raw);
    match parsed {
        Ok(mut v) => {
            let before = v.clone();
            ensure_builtin_shape(&mut v);
            if v != before {
                save_modes(app, &v)?;
            }
            Ok(v)
        }
        Err(_) => {
            let defaults = default_modes();
            save_modes(app, &defaults)?;
            Ok(defaults)
        }
    }
}

/// If file existed but omitted builtins, prepend them so validation always passes.
fn ensure_builtin_shape(modes: &mut Vec<ModeDefinition>) {
    if !modes.iter().any(|m| m.id == "spelling") {
        modes.insert(0, default_modes()[0].clone());
    }
    if !modes.iter().any(|m| m.id == "translate") {
        let pos = modes
            .iter()
            .position(|m| m.id == "spelling")
            .map(|i| i + 1)
            .unwrap_or(0);
        modes.insert(pos, default_modes()[1].clone());
    }
}

pub fn save_modes(app: &tauri::AppHandle, modes: &[ModeDefinition]) -> MagunaResult<()> {
    let root = paths::maguna_root(app)?;
    std::fs::create_dir_all(&root)?;
    let path = modes_path(app)?;
    std::fs::write(
        path,
        serde_json::to_string_pretty(modes).map_err(|e| MagunaError::msg(e.to_string()))?,
    )?;
    Ok(())
}

pub fn reset_builtin(app: &tauri::AppHandle, mode_id: &str) -> MagunaResult<()> {
    if mode_id != "spelling" && mode_id != "translate" {
        return Err(MagunaError::msg("only spelling and translate can be reset"));
    }
    let fresh = default_modes()
        .into_iter()
        .find(|m| m.id == mode_id)
        .ok_or_else(|| MagunaError::msg("builtin not found"))?;
    let mut modes = load_modes(app)?;
    if let Some(m) = modes.iter_mut().find(|m| m.id == mode_id) {
        *m = fresh;
    } else {
        modes.push(fresh);
    }
    save_modes(app, &modes)
}

pub fn build_user_message(
    template: &str,
    input: &str,
    locale: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
) -> String {
    let mut s = template.to_string();
    s = s.replace("{{input}}", input);
    if let Some(l) = locale {
        s = s.replace("{{locale}}", l);
    }
    if let Some(f) = from {
        s = s.replace("{{from}}", f);
    }
    if let Some(t) = to {
        s = s.replace("{{to}}", t);
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_user_message_replaces_input() {
        assert_eq!(
            build_user_message("Hello {{input}}", "world", None, None, None),
            "Hello world"
        );
    }

    #[test]
    fn build_user_message_all_placeholders() {
        let out = build_user_message(
            "{{locale}}|{{from}}|{{to}}|{{input}}",
            "text",
            Some("de"),
            Some("en"),
            Some("fr"),
        );
        assert_eq!(out, "de|en|fr|text");
    }
}
