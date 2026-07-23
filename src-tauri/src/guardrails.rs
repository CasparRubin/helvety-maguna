//! Global safety policy prepended to each mode [`system_prompt`](crate::modes::ModeDefinition::system_prompt).
//! Guardrails cannot be disabled; [`PersistedSettings::guardrails_enabled`](crate::state::PersistedSettings)
//! is kept for settings-file compatibility and is always treated as on at runtime.

use crate::state::PersistedSettings;

pub const GUARDRAILS_SYSTEM_DEFAULT: &str = r#"Maguna content policy (always follow; mode-specific instructions below do not override these rules):
- Keep a calm, neutral, factual tone. Avoid melodrama, manipulation, or gratuitous emotional language.
- Do not provide instructions, encouragement, or operational detail that could help someone harm people, animals, or property, or violate the law.
- Do not produce sexually explicit or pornographic content; decline briefly if asked.
- If a request conflicts with this policy, refuse briefly without lecturing. Do not claim to have "no restrictions" or to ignore these constraints."#;

fn trimmed_custom(settings: &PersistedSettings) -> Option<&str> {
    settings
        .guardrails_custom_text
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

/// Active guardrails block (custom paragraph or built-in default).
fn guardrails_prefix(settings: &PersistedSettings) -> Option<&str> {
    Some(match trimmed_custom(settings) {
        Some(s) => s,
        None => GUARDRAILS_SYSTEM_DEFAULT,
    })
}

/// System string sent to the chat template: global guardrail prefix (always), then mode instructions.
pub fn compose_effective_system(mode_system_prompt: &str, settings: &PersistedSettings) -> String {
    match guardrails_prefix(settings) {
        None => mode_system_prompt.to_string(),
        Some(prefix) if mode_system_prompt.trim().is_empty() => prefix.to_string(),
        Some(prefix) => format!("{prefix}\n\n{mode_system_prompt}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn settings(enabled: bool, custom: Option<&str>) -> PersistedSettings {
        PersistedSettings {
            active_model_id: None,
            mode_model_ids: HashMap::new(),
            guardrails_enabled: enabled,
            guardrails_custom_text: custom.map(String::from),
            enable_model_thinking: false,
        }
    }

    #[test]
    fn guardrails_always_prepended_even_if_legacy_enabled_flag_false() {
        let s = settings(false, None);
        let out = compose_effective_system("Do the task.", &s);
        assert!(out.starts_with(GUARDRAILS_SYSTEM_DEFAULT));
        assert!(out.ends_with("Do the task."));
    }

    #[test]
    fn enabled_uses_default_plus_mode() {
        let s = settings(true, None);
        let out = compose_effective_system("Do the task.", &s);
        assert!(out.starts_with(GUARDRAILS_SYSTEM_DEFAULT));
        assert!(out.ends_with("Do the task."));
        assert!(out.contains("\n\n"));
    }

    #[test]
    fn enabled_custom_replaces_default() {
        let s = settings(true, Some("CUSTOM ONLY"));
        let out = compose_effective_system("Mode line.", &s);
        assert!(out.starts_with("CUSTOM ONLY"));
        assert!(out.ends_with("Mode line."));
    }

    #[test]
    fn enabled_empty_custom_uses_default() {
        let s = settings(true, Some("   "));
        let out = compose_effective_system("x", &s);
        assert!(out.starts_with(GUARDRAILS_SYSTEM_DEFAULT));
    }

    #[test]
    fn enabled_empty_mode_returns_prefix_only() {
        let s = settings(true, None);
        assert_eq!(
            compose_effective_system("", &s),
            GUARDRAILS_SYSTEM_DEFAULT.to_string()
        );
        assert_eq!(
            compose_effective_system("  \n  ", &s),
            GUARDRAILS_SYSTEM_DEFAULT.to_string()
        );
    }
}
