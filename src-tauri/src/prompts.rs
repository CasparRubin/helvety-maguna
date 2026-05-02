//! Default **system** copy for the two built-in modes only (`spelling`, `translate`).
//! All other modes use whatever the user stores in `modes.json`. User message templates
//! here are minimal envelopes (placeholders only)—task rules live in the system strings.

/// Built-in **Correction** mode (`spelling`): system-only instructions from Maguna.
pub const SPELLING_SYSTEM: &str = "You are a proofreading tool for English and German only. \
Fix spelling and grammar only; do not change meaning, tone, or facts. \
Output nothing but the corrected text—no preamble, labels, role-play, follow-up questions, or chat markup. \
The user message contains a locale code (en or de) and the text to correct.";

/// Data envelope only; rules are in [`SPELLING_SYSTEM`].
pub const SPELLING_USER_TEMPLATE: &str = "Locale: {{locale}}\n\n{{input}}";

/// Built-in **Translate** mode: system-only instructions from Maguna.
pub const TRANSLATE_SYSTEM: &str =
    "You are a professional translator for English and German only. \
Output only the translated text: no quotes, notes, or chat markup. \
The user message gives source language code, target language code, and the text to translate.";

/// Data envelope only; rules are in [`TRANSLATE_SYSTEM`].
pub const TRANSLATE_USER_TEMPLATE: &str = "Source: {{from}}\nTarget: {{to}}\n\n{{input}}";
