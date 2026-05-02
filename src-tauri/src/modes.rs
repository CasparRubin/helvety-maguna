use serde::{Deserialize, Serialize};

use crate::error::{MagunaError, MagunaResult};
use crate::paths;
use crate::prompts;

/// How [`format_user_turn`] shapes one user blob for **`run_mode`** (plain, locale, translate).
/// **`Chat`** is only sent through **`run_mode_chat`** (`format_user_turn(Chat, …)` is pass-through).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PromptLayout {
    /// Only the input block is sent.
    #[default]
    Plain,
    /// Input language + input + output language; in `format_user_turn`, output defaults to input when `to` is omitted.
    Locale,
    /// Input language + input + output language; source and target may match (built-in corrections use this with de–de / en–en).
    Translate,
    /// Multi-turn chat: use `run_mode_chat` with message history; no fixed I/O language framing in the user turn.
    Chat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModeDefinition {
    pub id: String,
    pub name: String,
    /// User-owned except built-in factory defaults in `prompts.rs`.
    /// Empty is allowed for custom modes.
    pub system_prompt: String,
    #[serde(default)]
    pub prompt_layout: PromptLayout,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub builtin: bool,
}

/// Loose shape for `modes.json` migration (older files had `user_message_template`).
#[derive(Debug, Deserialize)]
struct ModeDefinitionLoose {
    id: String,
    name: String,
    system_prompt: String,
    #[serde(default)]
    user_message_template: Option<String>,
    #[serde(default)]
    prompt_layout: Option<PromptLayout>,
    #[serde(default = "default_max_tokens")]
    max_tokens: u32,
    #[serde(default)]
    builtin: bool,
}

impl From<ModeDefinitionLoose> for ModeDefinition {
    fn from(loose: ModeDefinitionLoose) -> Self {
        let prompt_layout = loose.prompt_layout.unwrap_or_else(|| {
            let t = loose
                .user_message_template
                .as_deref()
                .unwrap_or("{{input}}");
            if t.contains("{{from}}") || t.contains("{{to}}") {
                PromptLayout::Translate
            } else if t.contains("{{locale}}") {
                PromptLayout::Locale
            } else {
                PromptLayout::Plain
            }
        });
        ModeDefinition {
            id: loose.id,
            name: loose.name,
            system_prompt: loose.system_prompt,
            prompt_layout,
            max_tokens: loose.max_tokens,
            builtin: loose.builtin,
        }
    }
}

fn default_max_tokens() -> u32 {
    768
}

pub fn default_modes() -> Vec<ModeDefinition> {
    vec![
        ModeDefinition {
            id: "chat".into(),
            name: "Chat".into(),
            system_prompt: prompts::CHAT_SYSTEM.into(),
            prompt_layout: PromptLayout::Chat,
            max_tokens: 2048,
            builtin: true,
        },
        ModeDefinition {
            id: "correction-de".into(),
            name: "Correction DE".into(),
            system_prompt: prompts::CORRECTION_DE_SYSTEM.into(),
            prompt_layout: PromptLayout::Translate,
            max_tokens: 384,
            builtin: true,
        },
        ModeDefinition {
            id: "correction-en".into(),
            name: "Correction EN".into(),
            system_prompt: prompts::CORRECTION_EN_SYSTEM.into(),
            prompt_layout: PromptLayout::Translate,
            max_tokens: 384,
            builtin: true,
        },
        ModeDefinition {
            id: "translate-de-en".into(),
            name: "Translate DE → EN".into(),
            system_prompt: prompts::TRANSLATE_DE_EN_SYSTEM.into(),
            prompt_layout: PromptLayout::Translate,
            max_tokens: 1024,
            builtin: true,
        },
        ModeDefinition {
            id: "translate-en-de".into(),
            name: "Translate EN → DE".into(),
            system_prompt: prompts::TRANSLATE_EN_DE_SYSTEM.into(),
            prompt_layout: PromptLayout::Translate,
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
    let parsed: Result<Vec<ModeDefinitionLoose>, _> = serde_json::from_str(&raw);
    match parsed {
        Ok(loose_list) => {
            let mut v: Vec<ModeDefinition> = loose_list.into_iter().map(Into::into).collect();
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
    // Remove legacy built-ins from older versions.
    modes.retain(|m| m.id != "spelling" && m.id != "translate");

    let defaults = default_modes();
    for (idx, builtin) in defaults.iter().enumerate() {
        if !modes.iter().any(|m| m.id == builtin.id) {
            modes.insert(idx, builtin.clone());
        }
    }

    // Built-ins must keep their intended layout and builtin flag.
    for builtin in defaults {
        if let Some(m) = modes.iter_mut().find(|m| m.id == builtin.id) {
            m.prompt_layout = builtin.prompt_layout;
            m.builtin = true;
        }
    }
}

pub fn is_builtin_mode_id(mode_id: &str) -> bool {
    default_modes().iter().any(|m| m.id == mode_id)
}

pub fn builtin_layout(mode_id: &str) -> Option<PromptLayout> {
    default_modes()
        .into_iter()
        .find(|m| m.id == mode_id)
        .map(|m| m.prompt_layout)
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
    if !is_builtin_mode_id(mode_id) {
        return Err(MagunaError::msg("only built-in modes can be reset"));
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

/// Fixed user-turn layout: input language → input → output language (when applicable).
pub fn format_user_turn(
    layout: PromptLayout,
    input: &str,
    locale: Option<&str>,
    from: Option<&str>,
    to: Option<&str>,
) -> String {
    match layout {
        PromptLayout::Plain => {
            format!("Input:\n\n{input}")
        }
        PromptLayout::Locale => {
            let in_lang = from.or(locale).unwrap_or("?");
            let out_lang = to.unwrap_or(in_lang);
            format!("Input language: {in_lang}\n\nInput:\n\n{input}\n\nOutput language: {out_lang}")
        }
        PromptLayout::Translate => {
            let f = from.unwrap_or("?");
            let t = to.unwrap_or("?");
            format!("Input language: {f}\n\nInput:\n\n{input}\n\nOutput language: {t}")
        }
        // Unused by `run_mode_chat`; passthrough keeps the helper total if ever called by mistake.
        PromptLayout::Chat => input.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_modes_include_expected_builtins_in_order() {
        let ids: Vec<String> = default_modes().into_iter().map(|m| m.id).collect();
        assert_eq!(
            ids,
            vec![
                "chat",
                "correction-de",
                "correction-en",
                "translate-de-en",
                "translate-en-de",
            ]
        );
    }

    #[test]
    fn default_builtin_system_prompts_match_prompt_constants() {
        let modes = default_modes();
        let chat = modes.iter().find(|m| m.id == "chat").unwrap();
        assert_eq!(chat.system_prompt, prompts::CHAT_SYSTEM);
        assert_eq!(chat.prompt_layout, PromptLayout::Chat);
        let de = modes.iter().find(|m| m.id == "correction-de").unwrap();
        let en = modes.iter().find(|m| m.id == "correction-en").unwrap();
        let d2e = modes.iter().find(|m| m.id == "translate-de-en").unwrap();
        let e2d = modes.iter().find(|m| m.id == "translate-en-de").unwrap();
        assert_eq!(de.system_prompt, prompts::CORRECTION_DE_SYSTEM);
        assert_eq!(en.system_prompt, prompts::CORRECTION_EN_SYSTEM);
        assert_eq!(d2e.system_prompt, prompts::TRANSLATE_DE_EN_SYSTEM);
        assert_eq!(e2d.system_prompt, prompts::TRANSLATE_EN_DE_SYSTEM);
        // Correction uses the same user-turn shape as translation (language in + out);
        // monolingual runs use matching languages (de–de, en–en) in the UI.
        assert_eq!(de.prompt_layout, PromptLayout::Translate);
        assert_eq!(en.prompt_layout, PromptLayout::Translate);
        assert_eq!(d2e.prompt_layout, PromptLayout::Translate);
        assert_eq!(e2d.prompt_layout, PromptLayout::Translate);
    }

    #[test]
    fn ensure_builtin_shape_migrates_legacy_ids_and_inserts_missing_defaults() {
        let mut modes = vec![ModeDefinition {
            id: "spelling".into(),
            name: "Old Correction".into(),
            system_prompt: "legacy".into(),
            prompt_layout: PromptLayout::Plain,
            max_tokens: 111,
            builtin: false,
        }];
        ensure_builtin_shape(&mut modes);
        let ids: Vec<String> = modes.iter().map(|m| m.id.clone()).collect();
        assert!(!ids.contains(&"spelling".to_string()));
        assert!(!ids.contains(&"translate".to_string()));
        assert_eq!(ids.first().map(String::as_str), Some("chat"));
        assert!(ids.contains(&"correction-de".to_string()));
        assert!(ids.contains(&"correction-en".to_string()));
        assert!(ids.contains(&"translate-de-en".to_string()));
        assert!(ids.contains(&"translate-en-de".to_string()));
        assert!(ids.contains(&"chat".to_string()));
    }

    #[test]
    fn ensure_builtin_shape_resets_stale_correction_layout_to_translate() {
        let mut modes = default_modes();
        for id in ["correction-de", "correction-en"] {
            if let Some(m) = modes.iter_mut().find(|m| m.id == id) {
                m.prompt_layout = PromptLayout::Locale;
            }
        }
        ensure_builtin_shape(&mut modes);
        for id in ["correction-de", "correction-en"] {
            let m = modes.iter().find(|m| m.id == id).unwrap();
            assert_eq!(
                m.prompt_layout,
                PromptLayout::Translate,
                "{id} must match shipped default (Translate)"
            );
        }
    }

    #[test]
    fn format_chat_passes_input() {
        assert_eq!(
            format_user_turn(PromptLayout::Chat, "hello", None, None, None),
            "hello"
        );
    }

    #[test]
    fn format_plain() {
        assert_eq!(
            format_user_turn(PromptLayout::Plain, "hello", None, None, None),
            "Input:\n\nhello"
        );
    }

    #[test]
    fn format_locale() {
        let out = format_user_turn(PromptLayout::Locale, "text", Some("de"), None, None);
        assert!(out.contains("Input language: de"));
        assert!(out.contains("text"));
        assert!(out.contains("Output language: de"));
    }

    #[test]
    fn format_locale_separate_output_language_via_from_to() {
        let out = format_user_turn(PromptLayout::Locale, "x", None, Some("de"), Some("en"));
        assert!(out.contains("Input language: de"));
        assert!(out.contains("Output language: en"));
    }

    #[test]
    fn format_translate() {
        let out = format_user_turn(PromptLayout::Translate, "hi", None, Some("en"), Some("de"));
        assert!(out.contains("Input language: en"));
        assert!(out.contains("hi"));
        assert!(out.contains("Output language: de"));
    }

    #[test]
    fn format_translate_same_language_for_correction_style() {
        let out = format_user_turn(
            PromptLayout::Translate,
            "fix me",
            None,
            Some("de"),
            Some("de"),
        );
        assert!(out.contains("Input language: de"));
        assert!(out.contains("fix me"));
        assert!(out.contains("Output language: de"));
    }
}
