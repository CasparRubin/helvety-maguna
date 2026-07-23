//! **Chat framing** for each GGUF family (how `system` + `user` strings are wrapped for the
//! tokenizer). The `system` string passed in here is the **composed** prompt from
//! [`crate::guardrails::compose_effective_system`]: global guardrails from `settings.json` (always on;
//! built-in or custom text) plus mode-specific prose from [`crate::modes::ModeDefinition`] (defaults in [`crate::prompts`],
//! overrides in `modes.json`).
//!
//! Qwen2.x / Qwen3 / Qwen3.5 / Qwen3.6 instruct uses ChatML (`im_start` / `im_end`). Maguna
//! defaults to **Thinking is off** (empty `think` block; matches `enable_thinking=false`); Settings /
//! mode pages can set **Thinking is on**. DeepSeek-R1 distill (`qwen2_instruct_reasoning`) keeps
//! thinking enabled.
//! Ministral 3 and Moonshot Moonlight / Kimi K2 use `im_system` / `im_user` / `im_middle` tokens.
//! Google Gemma 2 uses `<start_of_turn>` turns; Gemma 4 uses `<|turn>` / `<turn|>` with an empty
//! `<|channel>thought` / `<channel|>` prefix when Thinking is off (Settings can open the thought channel).
//! Microsoft Phi-4 mini uses `<|system|>`, `<|user|>`, `<|assistant|>`, `<|end|>`.
//! Tencent Hunyuan dense uses `<|startoftext|>`, `<|extra_4|>`, `<|extra_0|>`, `<|eos|>`.
//! Z.ai GLM-4 9B uses `[gMASK]<sop>` plus `<|system|>` / `<|user|>` / `<|assistant|>`.
//! GLM-4.7 Flash appends `/nothink` on user turns when Thinking is off; Settings can omit it.
//! GLM-Z1 opens a think block at generation time for reasoning imports.
//!
//! Filename / display-name hints (used for GGUF imports) are always compiled.
//! The resolved enum is compiled with the `llama` feature. `ChatTemplate::format_prompt` wraps
//! one system + user turn; multi-turn Chat uses `format_prompt_chat` on the same variants.
//! Both take an `enable_thinking` setting flag (reasoning templates ignore it and stay on).

/// If a hint (imported file stem, display name, etc.) looks like a known instruct
/// family, returns the manifest/catalog key (`mistral_instruct`, `qwen2_instruct`, …).
pub fn try_catalog_template_key_from_hint(hint: &str) -> Option<&'static str> {
    let lower = hint.to_ascii_lowercase();
    if lower.contains("ministral") {
        return Some("mistral3_instruct");
    }
    if lower.contains("mistral") {
        return Some("mistral_instruct");
    }
    if lower.contains("hunyuan") {
        return Some("hunyuan_dense");
    }
    if lower.contains("phi-4") || lower.contains("phi4") || lower.contains("phi_4") {
        return Some("phi4_instruct");
    }
    if lower.contains("deepseek-r1") || lower.contains("deepseek_r1") {
        return Some("qwen2_instruct_reasoning");
    }
    if lower.contains("qwen") {
        return Some("qwen2_instruct");
    }
    if lower.contains("gemma-4") || lower.contains("gemma4") || lower.contains("gemma_4") {
        return Some("gemma4_it");
    }
    if lower.contains("gemma") {
        return Some("gemma2_it");
    }
    if lower.contains("moonlight") || lower.contains("moonshot") || lower.contains("kimi") {
        return Some("moonshot_instruct");
    }
    if lower.contains("glm-4.7")
        || lower.contains("glm47")
        || lower.contains("glm_4.7")
        || lower.contains("glm-4.7-flash")
    {
        return Some("glm47_flash");
    }
    if lower.contains("glm-z1") || lower.contains("glm_z1") {
        return Some("glm4_z1");
    }
    if lower.contains("glm-4-9b")
        || lower.contains("glm4-9b")
        || lower.contains("glm_4_9b")
        || lower.contains("glm-4-9b-0414")
    {
        return Some("glm4_instruct");
    }
    if lower.contains("glm-4") || lower.contains("glm4") || lower.contains("glm_4") {
        return Some("glm4_instruct");
    }
    if lower.contains("llama-3.2")
        || lower.contains("llama3.2")
        || lower.contains("llama_3.2")
        || lower.contains("llama-3-")
        || lower.contains("meta-llama-3")
    {
        return Some("llama3_instruct");
    }
    None
}

/// First matching hint wins (e.g. GGUF file stem, then user display name for imports).
pub fn manifest_template_key_from_hints<'a>(hints: impl IntoIterator<Item = &'a str>) -> String {
    for h in hints {
        let h = h.trim();
        if h.is_empty() {
            continue;
        }
        if let Some(key) = try_catalog_template_key_from_hint(h) {
            return key.to_string();
        }
    }
    String::new()
}

#[cfg(feature = "llama")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatPieceRole {
    User,
    Assistant,
}

#[cfg(feature = "llama")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatTemplate {
    TinyLlamaV1,
    Llama3Instruct,
    MistralInstruct,
    /// Qwen2 / Qwen2.5 / Qwen3 / Qwen3.5 / Qwen3.6 instruct (ChatML; Thinking is off by default via Settings).
    QwenChatMl,
    /// Qwen ChatML with thinking always enabled (DeepSeek-R1 distill and similar reasoning models).
    QwenChatMlReasoning,
    /// Google Gemma 2 instruction-tuned (`start_of_turn` / `end_of_turn`).
    Gemma2It,
    /// Google Gemma 4 instruction-tuned (`<|turn>` / `<turn|>` + channel prefix; Thinking is off by default).
    Gemma4It,
    /// Mistral 3 / Ministral instruct (mistral-common token layout).
    Mistral3Instruct,
    /// Moonshot Moonlight, Kimi K2 instruct, and same token layout as llama.cpp `kimi-k2`.
    KimiMoonshot,
    /// Microsoft Phi-4 mini instruct (`<|system|>`, `<|user|>`, `<|assistant|>`, `<|end|>`).
    Phi4Instruct,
    /// Tencent Hunyuan dense / Hunyuan-MT (`<|startoftext|>`, `<|extra_4|>`, `<|extra_0|>`, `<|eos|>`).
    HunyuanDense,
    /// Z.ai GLM-4 9B instruct (`[gMASK]<sop>` + role tokens).
    Glm4Instruct,
    /// Z.ai GLM-4.7 Flash MoE (`/nothink` on user turns when thinking is off; toggleable in Settings).
    Glm47Flash,
    /// Z.ai GLM-Z1 reasoning (opens a think block at generation time; always on).
    Glm4Z1Reasoning,
}

#[cfg(feature = "llama")]
const GLM4_PREFIX: &str = "[gMASK]<sop>";

#[cfg(feature = "llama")]
fn glm47_user_turn(user: &str, enable_thinking: bool) -> String {
    if enable_thinking {
        user.strip_suffix("/nothink")
            .map(str::to_string)
            .unwrap_or_else(|| user.to_string())
    } else if user.ends_with("/nothink") {
        user.to_string()
    } else {
        format!("{user}/nothink")
    }
}

#[cfg(feature = "llama")]
fn glm47_assistant_history(text: &str) -> String {
    const THINK_CLOSE: &str = concat!("</", "think", ">");
    format!("<|assistant|>{THINK_CLOSE}{text}")
}

#[cfg(feature = "llama")]
fn glm_assistant_gen_prefix(enable_thinking: bool) -> String {
    if enable_thinking {
        concat!("<|assistant|><", "think", ">").to_string()
    } else {
        "<|assistant|>".to_string()
    }
}

#[cfg(feature = "llama")]
fn qwen_chatml_assistant_gen_prefix(disable_thinking: bool) -> String {
    const IM_START: &str = concat!("<|", "im_start", "|>");
    if !disable_thinking {
        return format!("{IM_START}assistant\n");
    }
    const THINK_OPEN: &str = concat!("<", "think", ">");
    const THINK_CLOSE: &str = concat!("</", "think", ">");
    // Qwen3+ `enable_thinking=false`: closed empty think block before generation.
    format!("{IM_START}assistant\n{THINK_OPEN}\n\n{THINK_CLOSE}\n\n")
}

#[cfg(feature = "llama")]
fn qwen_chatml_assistant_history(text: &str, disable_thinking: bool) -> String {
    const IM_START: &str = concat!("<|", "im_start", "|>");
    const IM_END: &str = concat!("<|", "im_end", "|>");
    if disable_thinking {
        const THINK_OPEN: &str = concat!("<", "think", ">");
        const THINK_CLOSE: &str = concat!("</", "think", ">");
        format!("{IM_START}assistant\n{THINK_OPEN}\n\n{THINK_CLOSE}\n\n{text}{IM_END}\n")
    } else {
        format!("{IM_START}assistant\n{text}{IM_END}\n")
    }
}

/// Model-thinking disabled: empty thought channel then answer.
/// Enabled (`Thinking is on`): open thought channel for the model to fill.
#[cfg(feature = "llama")]
fn gemma4_model_gen_prefix(enable_thinking: bool) -> &'static str {
    if enable_thinking {
        "<|turn>model\n<|channel>thought\n"
    } else {
        "<|turn>model\n<|channel>thought\n<channel|>"
    }
}

#[cfg(feature = "llama")]
fn gemma4_assistant_history(text: &str, enable_thinking: bool) -> String {
    if enable_thinking {
        format!("<|turn>model\n{text}<turn|>\n")
    } else {
        format!("<|turn>model\n<|channel>thought\n<channel|>{text}<turn|>\n")
    }
}

#[cfg(feature = "llama")]
fn format_qwen_chatml_prompt(system: &str, user: &str, disable_thinking: bool) -> String {
    const IM_START: &str = concat!("<|", "im_start", "|>");
    const IM_END: &str = concat!("<|", "im_end", "|>");
    format!(
        "{IM_START}system\n{system}{IM_END}\n{IM_START}user\n{user}{IM_END}\n{}",
        qwen_chatml_assistant_gen_prefix(disable_thinking)
    )
}

#[cfg(feature = "llama")]
fn format_qwen_chatml_chat(
    system: &str,
    pieces: &[(ChatPieceRole, &str)],
    disable_thinking: bool,
) -> String {
    const IM_START: &str = concat!("<|", "im_start", "|>");
    const IM_END: &str = concat!("<|", "im_end", "|>");
    let mut s = format!("{IM_START}system\n{system}{IM_END}\n");
    for &(role, text) in pieces {
        match role {
            ChatPieceRole::User => {
                s.push_str(&format!("{IM_START}user\n{text}{IM_END}\n"));
            }
            ChatPieceRole::Assistant => {
                s.push_str(&qwen_chatml_assistant_history(text, disable_thinking));
            }
        }
    }
    s.push_str(&qwen_chatml_assistant_gen_prefix(disable_thinking));
    s
}

#[cfg(feature = "llama")]
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
            "mistral3_instruct" | "mistral3" | "ministral" => Self::Mistral3Instruct,
            "qwen2_instruct" | "qwen_instruct" | "qwen_chatml" | "chatml" => Self::QwenChatMl,
            "qwen2_instruct_reasoning" | "qwen_reasoning" => Self::QwenChatMlReasoning,
            "gemma2_it" | "gemma2" | "gemma_it" => Self::Gemma2It,
            "gemma4_it" | "gemma4" => Self::Gemma4It,
            "moonshot_instruct" | "kimi_k2" | "kimi" | "moonlight" => Self::KimiMoonshot,
            "phi4_instruct" | "phi4" | "phi-4" | "phi_4" => Self::Phi4Instruct,
            "hunyuan_dense" | "hunyuan" | "hunyuan-dense" => Self::HunyuanDense,
            "glm4_instruct" | "glm4" | "chatglm4" => Self::Glm4Instruct,
            "glm47_flash" | "glm4_flash" | "glm-4.7-flash" => Self::Glm47Flash,
            "glm4_z1" | "glm_z1" => Self::Glm4Z1Reasoning,
            _ => Self::TinyLlamaV1,
        }
    }

    fn infer_from_model_id(model_id: &str) -> Self {
        try_catalog_template_key_from_hint(model_id)
            .map(Self::from_catalog_str)
            .unwrap_or(Self::TinyLlamaV1)
    }

    /// DeepSeek-R1 / GLM-Z1 keep reasoning on; the Settings/mode **Thinking is on** toggle enables it for everyday Qwen / Gemma 4 / GLM-4.7.
    pub fn resolve_enable_thinking(self, setting: bool) -> bool {
        match self {
            Self::QwenChatMlReasoning | Self::Glm4Z1Reasoning => true,
            Self::QwenChatMl | Self::Gemma4It | Self::Glm47Flash => setting,
            Self::TinyLlamaV1
            | Self::Llama3Instruct
            | Self::MistralInstruct
            | Self::Mistral3Instruct
            | Self::Gemma2It
            | Self::KimiMoonshot
            | Self::Phi4Instruct
            | Self::HunyuanDense
            | Self::Glm4Instruct => false,
        }
    }

    pub fn format_prompt(self, system: &str, user: &str, enable_thinking: bool) -> String {
        const IM_END: &str = concat!("<|", "im_end", "|>");
        const K_SYS: &str = concat!("<|", "im_system", "|>system<|", "im_middle", "|>");
        const K_USER: &str = concat!("<|", "im_user", "|>user<|", "im_middle", "|>");
        const K_ASST: &str = concat!("<|", "im_assistant", "|>assistant<|", "im_middle", "|>");
        // Reasoning catalog/import templates keep CoT on; the setting enables it for Qwen / Gemma 4 / GLM-4.7.
        let thinking = self.resolve_enable_thinking(enable_thinking);
        let disable_thinking = !thinking;

        match self {
            Self::TinyLlamaV1 => {
                format!("<|system|>\n{system}</s>\n<|user|>\n{user}</s>\n<|assistant|>\n")
            }
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
            Self::QwenChatMl | Self::QwenChatMlReasoning => {
                format_qwen_chatml_prompt(system, user, disable_thinking)
            }
            Self::Gemma2It => format!(
                "<start_of_turn>user\n{system}\n\n{user}<end_of_turn>\n<start_of_turn>model\n"
            ),
            Self::Gemma4It => {
                format!(
                    "<|turn>user\n{system}\n\n{user}<turn|>\n{}",
                    gemma4_model_gen_prefix(thinking)
                )
            }
            Self::Mistral3Instruct | Self::KimiMoonshot => {
                format!("{K_SYS}{system}{IM_END}{K_USER}{user}{IM_END}{K_ASST}")
            }
            Self::Phi4Instruct => {
                format!("<|system|>{system}<|end|><|user|>{user}<|end|><|assistant|>")
            }
            Self::HunyuanDense => format!("<|startoftext|>{system}<|extra_4|>{user}<|extra_0|>"),
            Self::Glm4Instruct => {
                format!("{GLM4_PREFIX}<|system|>{system}<|user|>{user}<|assistant|>")
            }
            // Hybrid thinking: omit `/nothink` when enabled; do not force a Z1-style open think tag.
            Self::Glm47Flash => {
                let user_turn = glm47_user_turn(user, thinking);
                format!("{GLM4_PREFIX}<|system|>{system}<|user|>{user_turn}<|assistant|>")
            }
            Self::Glm4Z1Reasoning => {
                let user_turn = glm47_user_turn(user, thinking);
                format!(
                    "{GLM4_PREFIX}<|system|>{system}<|user|>{user_turn}{}",
                    glm_assistant_gen_prefix(thinking)
                )
            }
        }
    }

    /// Multi-turn: `pieces` must start with `User` and alternate; the last piece is the latest user
    /// message to answer. Output ends with an open assistant generation prefix.
    pub fn format_prompt_chat(
        self,
        system: &str,
        pieces: &[(ChatPieceRole, &str)],
        enable_thinking: bool,
    ) -> String {
        const IM_END: &str = concat!("<|", "im_end", "|>");
        const K_SYS: &str = concat!("<|", "im_system", "|>system<|", "im_middle", "|>");
        const K_USER: &str = concat!("<|", "im_user", "|>user<|", "im_middle", "|>");
        const K_ASST: &str = concat!("<|", "im_assistant", "|>assistant<|", "im_middle", "|>");
        let thinking = self.resolve_enable_thinking(enable_thinking);
        let disable_thinking = !thinking;

        match self {
            Self::TinyLlamaV1 => {
                let mut s = format!("<|system|>\n{system}</s>\n");
                for &(role, text) in pieces {
                    match role {
                        ChatPieceRole::User => {
                            s.push_str(&format!("<|user|>\n{text}</s>\n"));
                        }
                        ChatPieceRole::Assistant => {
                            s.push_str(&format!("<|assistant|>\n{text}</s>\n"));
                        }
                    }
                }
                s.push_str("<|assistant|>\n");
                s
            }
            Self::Llama3Instruct => {
                const SH: &str = concat!("<|", "start_header_id", "|>");
                const EH: &str = concat!("<|", "end_header_id", "|>");
                const EOT: &str = concat!("<|", "eot_id", "|>");
                let mut out = String::from("<|begin_of_text|>");
                out.push_str(&format!("{SH}system{EH}\n\n{system}{EOT}"));
                for &(role, text) in pieces {
                    match role {
                        ChatPieceRole::User => {
                            out.push_str(&format!("{SH}user{EH}\n\n{text}{EOT}"));
                        }
                        ChatPieceRole::Assistant => {
                            out.push_str(&format!("{SH}assistant{EH}\n\n{text}{EOT}"));
                        }
                    }
                }
                out.push_str(&format!("{SH}assistant{EH}\n\n"));
                out
            }
            Self::MistralInstruct => {
                let mut out = String::from("<s>[INST] ");
                let Some((ChatPieceRole::User, first_user)) = pieces.first() else {
                    out.push_str(system);
                    return out;
                };
                out.push_str(&format!("{system}\n\n{first_user} [/INST]"));
                let mut i = 1usize;
                while i < pieces.len() {
                    let (ChatPieceRole::Assistant, a_text) = pieces[i] else {
                        break;
                    };
                    out.push_str(a_text);
                    out.push_str("</s>");
                    i += 1;
                    if i >= pieces.len() {
                        break;
                    }
                    let (ChatPieceRole::User, u_text) = pieces[i] else {
                        break;
                    };
                    out.push_str(&format!("[INST] {u_text} [/INST]"));
                    i += 1;
                }
                out
            }
            Self::QwenChatMl | Self::QwenChatMlReasoning => {
                format_qwen_chatml_chat(system, pieces, disable_thinking)
            }
            Self::Gemma2It => {
                let mut s = String::new();
                for (idx, &(role, text)) in pieces.iter().enumerate() {
                    match role {
                        ChatPieceRole::User => {
                            if idx == 0 {
                                s.push_str(&format!(
                                    "<start_of_turn>user\n{system}\n\n{text}<end_of_turn>\n"
                                ));
                            } else {
                                s.push_str(&format!("<start_of_turn>user\n{text}<end_of_turn>\n"));
                            }
                        }
                        ChatPieceRole::Assistant => {
                            s.push_str(&format!("<start_of_turn>model\n{text}<end_of_turn>\n"));
                        }
                    }
                }
                s.push_str("<start_of_turn>model\n");
                s
            }
            Self::Gemma4It => {
                let mut s = String::new();
                for (idx, &(role, text)) in pieces.iter().enumerate() {
                    match role {
                        ChatPieceRole::User => {
                            if idx == 0 {
                                s.push_str(&format!("<|turn>user\n{system}\n\n{text}<turn|>\n"));
                            } else {
                                s.push_str(&format!("<|turn>user\n{text}<turn|>\n"));
                            }
                        }
                        ChatPieceRole::Assistant => {
                            s.push_str(&gemma4_assistant_history(text, thinking));
                        }
                    }
                }
                s.push_str(gemma4_model_gen_prefix(thinking));
                s
            }
            Self::Mistral3Instruct | Self::KimiMoonshot => {
                let mut s = format!("{K_SYS}{system}{IM_END}");
                for &(role, text) in pieces {
                    match role {
                        ChatPieceRole::User => {
                            s.push_str(&format!("{K_USER}{text}{IM_END}"));
                        }
                        ChatPieceRole::Assistant => {
                            s.push_str(&format!("{K_ASST}{text}{IM_END}"));
                        }
                    }
                }
                s.push_str(K_ASST);
                s
            }
            Self::Phi4Instruct => {
                let mut s = format!("<|system|>{system}<|end|>");
                for &(role, text) in pieces {
                    match role {
                        ChatPieceRole::User => {
                            s.push_str(&format!("<|user|>{text}<|end|>"));
                        }
                        ChatPieceRole::Assistant => {
                            s.push_str(&format!("<|assistant|>{text}<|end|>"));
                        }
                    }
                }
                s.push_str("<|assistant|>");
                s
            }
            Self::HunyuanDense => {
                let mut s = format!("<|startoftext|>{system}<|extra_4|>");
                for (idx, &(role, text)) in pieces.iter().enumerate() {
                    match role {
                        ChatPieceRole::User => {
                            if idx == 0 {
                                s.push_str(&format!("{text}<|extra_0|>"));
                            } else {
                                s.push_str(&format!("<|startoftext|>{text}<|extra_0|>"));
                            }
                        }
                        ChatPieceRole::Assistant => {
                            s.push_str(&format!("{text}<|eos|>"));
                        }
                    }
                }
                s
            }
            Self::Glm4Instruct => {
                let mut s = format!("{GLM4_PREFIX}<|system|>{system}");
                for &(role, text) in pieces {
                    match role {
                        ChatPieceRole::User => {
                            s.push_str(&format!("<|user|>{text}"));
                        }
                        ChatPieceRole::Assistant => {
                            s.push_str(&format!("<|assistant|>{text}"));
                        }
                    }
                }
                s.push_str("<|assistant|>");
                s
            }
            Self::Glm47Flash => {
                let mut s = format!("{GLM4_PREFIX}<|system|>{system}");
                for &(role, text) in pieces {
                    match role {
                        ChatPieceRole::User => {
                            s.push_str(&format!("<|user|>{}", glm47_user_turn(text, thinking)));
                        }
                        ChatPieceRole::Assistant => {
                            if thinking {
                                s.push_str(&format!("<|assistant|>{text}"));
                            } else {
                                s.push_str(&glm47_assistant_history(text));
                            }
                        }
                    }
                }
                s.push_str("<|assistant|>");
                s
            }
            Self::Glm4Z1Reasoning => {
                let mut s = format!("{GLM4_PREFIX}<|system|>{system}");
                for &(role, text) in pieces {
                    match role {
                        ChatPieceRole::User => {
                            s.push_str(&format!("<|user|>{}", glm47_user_turn(text, thinking)));
                        }
                        ChatPieceRole::Assistant => {
                            if thinking {
                                s.push_str(&format!("<|assistant|>{text}"));
                            } else {
                                s.push_str(&glm47_assistant_history(text));
                            }
                        }
                    }
                }
                s.push_str(&glm_assistant_gen_prefix(thinking));
                s
            }
        }
    }
}

#[cfg(all(test, feature = "llama"))]
mod llama_chat_template_tests {
    use super::{ChatPieceRole, ChatTemplate};

    #[test]
    fn gemma4_it_single_turn_uses_turn_and_empty_channel() {
        let p = ChatTemplate::Gemma4It.format_prompt("SYS", "hello", false);
        assert_eq!(
            p,
            "<|turn>user\nSYS\n\nhello<turn|>\n<|turn>model\n<|channel>thought\n<channel|>"
        );
    }

    #[test]
    fn gemma4_it_thinking_opens_thought_channel() {
        let p = ChatTemplate::Gemma4It.format_prompt("SYS", "hello", true);
        assert_eq!(
            p,
            "<|turn>user\nSYS\n\nhello<turn|>\n<|turn>model\n<|channel>thought\n"
        );
    }

    #[test]
    fn qwen_chatml_thinking_on_skips_empty_think_block() {
        let p = ChatTemplate::QwenChatMl.format_prompt("SYS", "hello", true);
        const THINK_OPEN: &str = concat!("<", "think", ">");
        assert!(!p.contains(THINK_OPEN), "{p}");
        assert!(p.ends_with("assistant\n"), "{p}");
    }

    #[test]
    fn qwen_chatml_thinking_off_inserts_empty_think_block() {
        let p = ChatTemplate::QwenChatMl.format_prompt("SYS", "hello", false);
        const THINK_OPEN: &str = concat!("<", "think", ">");
        const THINK_CLOSE: &str = concat!("</", "think", ">");
        assert!(
            p.contains(&format!("{THINK_OPEN}\n\n{THINK_CLOSE}\n\n")),
            "{p}"
        );
    }

    #[test]
    fn qwen_reasoning_ignores_setting_false_and_stays_open() {
        let p = ChatTemplate::QwenChatMlReasoning.format_prompt("SYS", "hello", false);
        const THINK_OPEN: &str = concat!("<", "think", ">");
        assert!(!p.contains(THINK_OPEN), "{p}");
        assert!(p.ends_with("assistant\n"), "{p}");
    }

    #[test]
    fn qwen_chatml_multi_turn_history_includes_empty_think_blocks() {
        let t = ChatTemplate::QwenChatMl;
        let pieces = [
            (ChatPieceRole::User, "first"),
            (ChatPieceRole::Assistant, "hello"),
            (ChatPieceRole::User, "second"),
        ];
        let p = t.format_prompt_chat("SYS", &pieces, false);
        const THINK_OPEN: &str = concat!("<", "think", ">");
        const THINK_CLOSE: &str = concat!("</", "think", ">");
        assert!(
            p.contains(&format!("{THINK_OPEN}\n\n{THINK_CLOSE}\n\nhello")),
            "{p}"
        );
        assert!(p.contains("second"));
    }

    #[test]
    fn gemma4_it_chat_continues_turns_with_channel_prefix() {
        let pieces = [
            (ChatPieceRole::User, "first"),
            (ChatPieceRole::Assistant, "reply"),
            (ChatPieceRole::User, "second"),
        ];
        let p = ChatTemplate::Gemma4It.format_prompt_chat("SYS", &pieces, false);
        assert!(p.contains("first<turn|>"));
        assert!(p.contains("<|channel>thought\n<channel|>reply<turn|>"));
        assert!(p.contains("<|turn>user\nsecond<turn|>"));
        assert!(p.ends_with("<|channel>thought\n<channel|>"));
    }

    #[test]
    fn qwen_reasoning_chat_ends_with_open_assistant() {
        let t = ChatTemplate::QwenChatMlReasoning;
        let pieces = [(ChatPieceRole::User, "hi")];
        let p = t.format_prompt_chat("SYS", &pieces, true);
        assert!(p.ends_with("assistant\n"));
        const THINK_CLOSE: &str = concat!("</", "think", ">");
        assert!(!p.contains(THINK_CLOSE));
    }

    #[test]
    fn llama3_chat_orders_headers_and_roles() {
        let t = ChatTemplate::Llama3Instruct;
        let pieces = [
            (ChatPieceRole::User, "hi"),
            (ChatPieceRole::Assistant, "hello"),
            (ChatPieceRole::User, "next"),
        ];
        let p = t.format_prompt_chat("SYS", &pieces, false);
        assert!(p.contains("system"));
        assert!(p.contains("SYS"));
        let u1 = p.match_indices("user").count();
        assert!(u1 >= 2, "{p}");
        assert!(p.ends_with("assistant") || p.contains("assistant"));
        assert!(p.find("hi").unwrap() < p.find("hello").unwrap());
        assert!(p.find("hello").unwrap() < p.find("next").unwrap());
    }

    #[test]
    fn qwen_chatml_chat_ends_with_assistant_start() {
        let t = ChatTemplate::QwenChatMl;
        let pieces = [(ChatPieceRole::User, "hallo")];
        let p = t.format_prompt_chat("Be nice", &pieces, false);
        assert!(p.contains("system"));
        assert!(p.contains("Be nice"));
        assert!(p.contains("user"));
        assert!(p.contains("hallo"));
        const THINK_CLOSE: &str = concat!("</", "think", ">");
        assert!(p.contains("assistant") && p.contains(THINK_CLOSE), "{}", p);
    }

    #[test]
    fn phi4_instruct_single_turn_wraps_roles() {
        let p = ChatTemplate::Phi4Instruct.format_prompt("SYS", "hello", false);
        assert_eq!(p, "<|system|>SYS<|end|><|user|>hello<|end|><|assistant|>");
    }

    #[test]
    fn phi4_instruct_chat_ends_with_assistant_prefix() {
        let pieces = [
            (ChatPieceRole::User, "hi"),
            (ChatPieceRole::Assistant, "hello"),
            (ChatPieceRole::User, "next"),
        ];
        let p = ChatTemplate::Phi4Instruct.format_prompt_chat("SYS", &pieces, false);
        assert!(p.starts_with("<|system|>SYS<|end|>"));
        assert!(p.contains("<|user|>hi<|end|>"));
        assert!(p.contains("<|assistant|>hello<|end|>"));
        assert!(p.ends_with("<|assistant|>"));
    }

    #[test]
    fn hunyuan_dense_single_turn_wraps_system_and_user() {
        let p = ChatTemplate::HunyuanDense.format_prompt("SYS", "hello", false);
        assert_eq!(p, "<|startoftext|>SYS<|extra_4|>hello<|extra_0|>");
    }

    #[test]
    fn hunyuan_dense_chat_continues_user_turns_with_startoftext() {
        let pieces = [
            (ChatPieceRole::User, "first"),
            (ChatPieceRole::Assistant, "reply"),
            (ChatPieceRole::User, "second"),
        ];
        let p = ChatTemplate::HunyuanDense.format_prompt_chat("SYS", &pieces, false);
        assert!(p.starts_with("<|startoftext|>SYS<|extra_4|>"));
        assert!(p.contains("first<|extra_0|>"));
        assert!(p.contains("reply<|eos|>"));
        assert!(p.contains("<|startoftext|>second<|extra_0|>"));
    }

    #[test]
    fn glm4_instruct_single_turn_uses_gmask_and_role_tokens() {
        let p = ChatTemplate::Glm4Instruct.format_prompt("SYS", "hello", false);
        assert_eq!(p, "[gMASK]<sop><|system|>SYS<|user|>hello<|assistant|>");
    }

    #[test]
    fn glm4_instruct_chat_continues_turns() {
        let pieces = [
            (ChatPieceRole::User, "first"),
            (ChatPieceRole::Assistant, "reply"),
            (ChatPieceRole::User, "second"),
        ];
        let p = ChatTemplate::Glm4Instruct.format_prompt_chat("SYS", &pieces, false);
        assert!(p.starts_with("[gMASK]<sop><|system|>SYS"));
        assert!(p.contains("<|user|>first"));
        assert!(p.contains("<|assistant|>reply"));
        assert!(p.contains("<|user|>second"));
        assert!(p.ends_with("<|assistant|>"));
    }

    #[test]
    fn glm47_flash_single_turn_appends_nothink() {
        let p = ChatTemplate::Glm47Flash.format_prompt("SYS", "hello", false);
        assert_eq!(
            p,
            "[gMASK]<sop><|system|>SYS<|user|>hello/nothink<|assistant|>"
        );
    }

    #[test]
    fn glm47_flash_thinking_on_omits_nothink_without_forcing_think_open() {
        let p = ChatTemplate::Glm47Flash.format_prompt("SYS", "hello", true);
        assert_eq!(p, "[gMASK]<sop><|system|>SYS<|user|>hello<|assistant|>");
        const THINK_OPEN: &str = concat!("<", "think", ">");
        assert!(!p.contains(THINK_OPEN), "{p}");
    }

    #[test]
    fn resolve_enable_thinking_keeps_reasoning_templates_on() {
        assert!(ChatTemplate::QwenChatMlReasoning.resolve_enable_thinking(false));
        assert!(ChatTemplate::Glm4Z1Reasoning.resolve_enable_thinking(false));
        assert!(!ChatTemplate::QwenChatMl.resolve_enable_thinking(false));
        assert!(ChatTemplate::QwenChatMl.resolve_enable_thinking(true));
        assert!(ChatTemplate::Gemma4It.resolve_enable_thinking(true));
        assert!(ChatTemplate::Glm47Flash.resolve_enable_thinking(true));
        assert!(!ChatTemplate::Glm4Instruct.resolve_enable_thinking(true));
        assert!(!ChatTemplate::Phi4Instruct.resolve_enable_thinking(true));
    }

    #[test]
    fn glm47_flash_chat_appends_nothink_and_closes_thinking_in_history() {
        const THINK_CLOSE: &str = concat!("</", "think", ">");
        let pieces = [
            (ChatPieceRole::User, "first"),
            (ChatPieceRole::Assistant, "reply"),
            (ChatPieceRole::User, "second"),
        ];
        let p = ChatTemplate::Glm47Flash.format_prompt_chat("SYS", &pieces, false);
        assert!(p.contains("<|user|>first/nothink"));
        assert!(p.contains(&format!("<|assistant|>{THINK_CLOSE}reply")));
        assert!(p.contains("<|user|>second/nothink"));
        assert!(p.ends_with("<|assistant|>"));
    }

    #[test]
    fn glm4_z1_single_turn_opens_thinking() {
        const THINK_OPEN: &str = concat!("<", "think", ">");
        let p = ChatTemplate::Glm4Z1Reasoning.format_prompt("SYS", "hello", true);
        assert_eq!(
            p,
            format!("[gMASK]<sop><|system|>SYS<|user|>hello<|assistant|>{THINK_OPEN}")
        );
    }

    #[test]
    fn glm4_z1_still_opens_thinking_when_setting_is_false() {
        const THINK_OPEN: &str = concat!("<", "think", ">");
        let p = ChatTemplate::Glm4Z1Reasoning.format_prompt("SYS", "hello", false);
        assert_eq!(
            p,
            format!("[gMASK]<sop><|system|>SYS<|user|>hello<|assistant|>{THINK_OPEN}")
        );
    }

    #[test]
    fn glm47_flash_chat_thinking_on_omits_nothink() {
        let pieces = [
            (ChatPieceRole::User, "first"),
            (ChatPieceRole::Assistant, "reply"),
            (ChatPieceRole::User, "second"),
        ];
        let p = ChatTemplate::Glm47Flash.format_prompt_chat("SYS", &pieces, true);
        assert!(p.contains("<|user|>first"));
        assert!(!p.contains("/nothink"), "{p}");
        assert!(p.contains("<|assistant|>reply"));
        assert!(p.ends_with("<|assistant|>"));
    }

    #[test]
    fn gemma4_it_chat_thinking_on_opens_thought_without_closing() {
        let pieces = [
            (ChatPieceRole::User, "first"),
            (ChatPieceRole::Assistant, "reply"),
            (ChatPieceRole::User, "second"),
        ];
        let p = ChatTemplate::Gemma4It.format_prompt_chat("SYS", &pieces, true);
        assert!(p.contains("<|turn>model\nreply<turn|>"));
        assert!(p.ends_with("<|channel>thought\n"));
        assert!(!p.ends_with("<channel|>"));
    }

    #[test]
    fn glm4_z1_chat_ends_with_thinking_prefix() {
        const THINK_OPEN: &str = concat!("<", "think", ">");
        let pieces = [(ChatPieceRole::User, "hi")];
        let p = ChatTemplate::Glm4Z1Reasoning.format_prompt_chat("SYS", &pieces, false);
        assert!(p.ends_with(&format!("<|assistant|>{THINK_OPEN}")));
    }

    #[test]
    fn glm_catalog_keys_resolve_to_expected_templates() {
        assert_eq!(
            ChatTemplate::from_catalog_str("glm4_instruct"),
            ChatTemplate::Glm4Instruct
        );
        assert_eq!(
            ChatTemplate::from_catalog_str("glm47_flash"),
            ChatTemplate::Glm47Flash
        );
        assert_eq!(
            ChatTemplate::from_catalog_str("glm4_z1"),
            ChatTemplate::Glm4Z1Reasoning
        );
    }

    #[test]
    fn mistral3_instruct_single_turn_uses_im_role_tokens() {
        const IM_END: &str = concat!("<|", "im_end", "|>");
        const K_SYS: &str = concat!("<|", "im_system", "|>system<|", "im_middle", "|>");
        const K_USER: &str = concat!("<|", "im_user", "|>user<|", "im_middle", "|>");
        const K_ASST: &str = concat!("<|", "im_assistant", "|>assistant<|", "im_middle", "|>");
        let p = ChatTemplate::Mistral3Instruct.format_prompt("SYS", "hello", false);
        assert_eq!(
            p,
            format!("{K_SYS}SYS{IM_END}{K_USER}hello{IM_END}{K_ASST}")
        );
        assert_eq!(
            ChatTemplate::from_catalog_str("mistral3_instruct"),
            ChatTemplate::Mistral3Instruct
        );
    }

    #[test]
    fn mistral3_instruct_chat_continues_turns_and_opens_assistant() {
        const IM_END: &str = concat!("<|", "im_end", "|>");
        const K_USER: &str = concat!("<|", "im_user", "|>user<|", "im_middle", "|>");
        const K_ASST: &str = concat!("<|", "im_assistant", "|>assistant<|", "im_middle", "|>");
        let pieces = [
            (ChatPieceRole::User, "first"),
            (ChatPieceRole::Assistant, "reply"),
            (ChatPieceRole::User, "second"),
        ];
        let p = ChatTemplate::Mistral3Instruct.format_prompt_chat("SYS", &pieces, false);
        assert!(p.contains(&format!("{K_USER}first{IM_END}")));
        assert!(p.contains(&format!("{K_ASST}reply{IM_END}")));
        assert!(p.contains(&format!("{K_USER}second{IM_END}")));
        assert!(p.ends_with(K_ASST));
    }

    #[test]
    fn kimi_moonshot_shares_mistral3_layout() {
        let a = ChatTemplate::Mistral3Instruct.format_prompt("SYS", "hi", false);
        let b = ChatTemplate::KimiMoonshot.format_prompt("SYS", "hi", false);
        assert_eq!(a, b);
    }
}

#[cfg(test)]
mod tests {
    use super::manifest_template_key_from_hints;

    #[test]
    fn manifest_key_hints_prefer_first_match_stem_then_name() {
        assert_eq!(
            manifest_template_key_from_hints(["", "mistral"]),
            "mistral_instruct".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["Qwen2.5-7B-Instruct-Q4_K_M", "anything",]),
            "qwen2_instruct".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["Qwen_Qwen3-8B-Q4_K_M"]),
            "qwen2_instruct".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["gemma-4-12B-it-Q4_K_M"]),
            "gemma4_it".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["gemma-story"]),
            "gemma2_it".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["DeepSeek-R1-Distill-Qwen-7B-Q4_K_M"]),
            "qwen2_instruct_reasoning".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["ministral-3-8b-instruct-q4km"]),
            "mistral3_instruct".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["mistral-7b-instruct-v03-q4km"]),
            "mistral_instruct".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["microsoft_Phi-4-mini-instruct-Q4_K_M"]),
            "phi4_instruct".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["Hunyuan-MT-7B-q4_k_m"]),
            "hunyuan_dense".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["zai-org_GLM-4.7-Flash-Q4_K_M"]),
            "glm47_flash".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["THUDM_GLM-4-9B-0414-Q4_K_M"]),
            "glm4_instruct".to_string()
        );
        assert_eq!(
            manifest_template_key_from_hints(["GLM-Z1-9B-0414-Q4_K_M"]),
            "glm4_z1".to_string()
        );
        assert!(manifest_template_key_from_hints(["zzz", "\n"]).is_empty());
    }
}
