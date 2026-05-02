//! **Chat framing** for each GGUF family (how `system` + `user` strings are wrapped for the
//! tokenizer). This is not the same as per-app “system prompts”: those live in `modes.json`
//! and are user-authored except the two built-in modes in `prompts.rs`.
//!
//! Qwen2.x uses ChatML (`im_start` / `im_end`). Gemma 2 IT uses `<start_of_turn>` turns.
//! Moonshot Moonlight / Kimi K2 use `im_system` / `im_user` / `im_middle` / `im_assistant`
//! special tokens (same shape as upstream llama.cpp `LLM_CHAT_TEMPLATE_KIMI_K2`).

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatTemplate {
    TinyLlamaV1,
    Llama3Instruct,
    MistralInstruct,
    /// Qwen2 / Qwen2.5 Instruct (ChatML).
    QwenChatMl,
    /// Google Gemma 2 instruction-tuned (`assistant` → `model` turn).
    Gemma2It,
    /// Moonshot Moonlight, Kimi K2 instruct, and same token layout as llama.cpp `kimi-k2`.
    KimiMoonshot,
}

impl ChatTemplate {
    /// `manifest_value` is persisted on install; empty means infer from `model_id`.
    pub fn resolve(manifest_value: &str, model_id: &str) -> Self {
        let t = manifest_value.trim();
        if !t.is_empty() {
            return Self::from_catalog_str(t);
        }
        Self::infer_from_model_id(model_id)
    }

    pub fn from_catalog_str(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "llama3" | "llama3_instruct" | "llama-3" => Self::Llama3Instruct,
            "mistral" | "mistral_instruct" => Self::MistralInstruct,
            "qwen2_instruct" | "qwen_instruct" | "qwen_chatml" | "chatml" => Self::QwenChatMl,
            "gemma2_it" | "gemma2" | "gemma_it" | "gemma" => Self::Gemma2It,
            "moonshot_instruct" | "kimi_k2" | "kimi" | "moonlight" => Self::KimiMoonshot,
            _ => Self::TinyLlamaV1,
        }
    }

    fn infer_from_model_id(model_id: &str) -> Self {
        let lower = model_id.to_ascii_lowercase();
        if lower.contains("mistral") {
            return Self::MistralInstruct;
        }
        if lower.contains("qwen") {
            return Self::QwenChatMl;
        }
        if lower.contains("gemma") {
            return Self::Gemma2It;
        }
        if lower.contains("moonlight") || lower.contains("moonshot") || lower.contains("kimi") {
            return Self::KimiMoonshot;
        }
        if lower.contains("llama-3.2")
            || lower.contains("llama3.2")
            || lower.contains("llama_3.2")
            || lower.contains("llama-3-")
            || lower.contains("meta-llama-3")
            || lower.contains("deepseek-r1")
            || lower.contains("deepseek_r1")
        {
            return Self::Llama3Instruct;
        }
        Self::TinyLlamaV1
    }

    pub fn format_prompt(self, system: &str, user: &str) -> String {
        const IM_START: &str = concat!("<|", "im_start", "|>");
        const IM_END: &str = concat!("<|", "im_end", "|>");
        const K_SYS: &str = concat!("<|", "im_system", "|>system<|", "im_middle", "|>");
        const K_USER: &str = concat!("<|", "im_user", "|>user<|", "im_middle", "|>");
        const K_ASST: &str = concat!("<|", "im_assistant", "|>assistant<|", "im_middle", "|>");

        match self {
            Self::TinyLlamaV1 => format!(
                "<|system|>\n{system}</s>\n<|user|>\n{user}</s>\n<|assistant|>\n"
            ),
            Self::Llama3Instruct => {
                const SH: &str = concat!("<|", "start_header_id", "|>");
                const EH: &str = concat!("<|", "end_header_id", "|>");
                const EOT: &str = concat!("<|", "eot_id", "|>");
                format!(
                    "<|begin_of_text|>{SH}system{EH}\n\n{system}{EOT}{SH}user{EH}\n\n{user}{EOT}{SH}assistant{EH}\n\n"
                )
            }
            Self::MistralInstruct => {
                // Mistral 7B Instruct: single [INST] block (system + user), then assistant generation.
                format!("<s>[INST] {system}\n\n{user} [/INST]")
            }
            Self::QwenChatMl => format!(
                "{IM_START}system\n{system}{IM_END}\n{IM_START}user\n{user}{IM_END}\n{IM_START}assistant\n"
            ),
            Self::Gemma2It => format!(
                "<start_of_turn>user\n{system}\n\n{user}<end_of_turn>\n<start_of_turn>model\n"
            ),
            Self::KimiMoonshot => format!("{K_SYS}{system}{IM_END}{K_USER}{user}{IM_END}{K_ASST}"),
        }
    }
}
