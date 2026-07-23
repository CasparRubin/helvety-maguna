//! Mode-aware llama.cpp sampler chains.
//!
//! Correction stays greedy for deterministic edits; Chat and Translate use
//! published-style temperature / top-p / top-k (Hy-MT recommends temp 0.7,
//! top_p 0.6, top_k 20 for its 7B class).
//!
//! Built-in Correction modes reuse [`PromptLayout::Translate`] with the same
//! input/output language (de→de / en→en). Sampler selection must use that
//! same-language signal — layout alone is not enough.

use llama_cpp_4::sampling::LlamaSampler;

/// Sampling profile selected from mode layout (+ languages for Translate).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SamplerProfile {
    /// Deterministic argmax — Correction and similar transform modes.
    Greedy,
    /// Everyday multi-turn Chat.
    Chat,
    /// Translation-tuned defaults (Hy-MT / Hunyuan-MT style).
    Translate,
}

impl SamplerProfile {
    /// Prefer [`Self::for_mode`] when `from`/`to` are known (Correction vs Translate).
    pub fn from_prompt_layout(layout: crate::modes::PromptLayout) -> Self {
        Self::for_mode(layout, None, None)
    }

    /// Select sampling for a run.
    ///
    /// `Translate` layout with matching `from`/`to` (correction-style) → greedy.
    /// True DE↔EN translate → Hy-MT-style temp/top-p.
    pub fn for_mode(
        layout: crate::modes::PromptLayout,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Self {
        match layout {
            crate::modes::PromptLayout::Locale | crate::modes::PromptLayout::Plain => Self::Greedy,
            crate::modes::PromptLayout::Chat => Self::Chat,
            crate::modes::PromptLayout::Translate => {
                let same_lang = match (from, to) {
                    (Some(f), Some(t)) => f.eq_ignore_ascii_case(t),
                    _ => false,
                };
                if same_lang {
                    Self::Greedy
                } else {
                    Self::Translate
                }
            }
        }
    }

    pub fn build(self) -> LlamaSampler {
        match self {
            Self::Greedy => LlamaSampler::chain_simple([LlamaSampler::greedy()]),
            Self::Chat => LlamaSampler::chain_simple([
                LlamaSampler::penalties_simple(64, 1.05),
                LlamaSampler::top_k(40),
                LlamaSampler::top_p(0.9, 1),
                LlamaSampler::temp(0.7),
                LlamaSampler::dist(0),
            ]),
            Self::Translate => LlamaSampler::chain_simple([
                LlamaSampler::penalties_simple(64, 1.05),
                LlamaSampler::top_k(20),
                LlamaSampler::top_p(0.6, 1),
                LlamaSampler::temp(0.7),
                LlamaSampler::dist(0),
            ]),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modes::PromptLayout;

    #[test]
    fn correction_same_language_is_greedy() {
        assert_eq!(
            SamplerProfile::for_mode(PromptLayout::Translate, Some("de"), Some("de")),
            SamplerProfile::Greedy
        );
        assert_eq!(
            SamplerProfile::for_mode(PromptLayout::Translate, Some("en"), Some("EN")),
            SamplerProfile::Greedy
        );
    }

    #[test]
    fn true_translate_uses_translate_profile() {
        assert_eq!(
            SamplerProfile::for_mode(PromptLayout::Translate, Some("de"), Some("en")),
            SamplerProfile::Translate
        );
    }

    #[test]
    fn chat_and_plain_profiles() {
        assert_eq!(
            SamplerProfile::for_mode(PromptLayout::Chat, None, None),
            SamplerProfile::Chat
        );
        assert_eq!(
            SamplerProfile::from_prompt_layout(PromptLayout::Plain),
            SamplerProfile::Greedy
        );
    }
}
