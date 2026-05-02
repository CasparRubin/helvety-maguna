//! Default **system** copy for the two built-in modes only (`spelling`, `translate`).
//! All other modes use whatever the user stores in `modes.json`. The user turn is built
//! by Maguna from [`crate::modes::PromptLayout`]—task rules live in the system strings.

/// Built-in **Correction** mode (`spelling`): system-only instructions from Maguna.
pub const SPELLING_SYSTEM: &str = "You are a proofreading tool for English and German only. \
Fix spelling and grammar only; do not change meaning, tone, or facts. \
Output nothing but the corrected text—no preamble, labels, role-play, follow-up questions, or chat markup. \
The user turn lists input language (en or de), the text to correct, and output language (same as input).";

/// Built-in **Translate** mode: system-only instructions from Maguna.
pub const TRANSLATE_SYSTEM: &str =
    "You are a professional translator for English and German only. \
Output only the translated text: no quotes, notes, or chat markup. \
The user turn lists input language, the text to translate, and output language (en or de).";
