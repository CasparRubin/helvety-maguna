export type CatalogEntry = {
  id: string;
  /** Company or team that released the base model. */
  maker: string;
  display_name: string;
  description: string;
  url: string;
  sha256: string | null;
  size_bytes: number;
  /** Present in bundled catalog JSON; not shown in the UI. */
  languages: string[];
  license_note: string;
  hf_repo: string;
  /** e.g. `tinyllama_v1`, `llama3_instruct`, `mistral_instruct`, `mistral3_instruct`, `qwen2_instruct`, `qwen2_instruct_reasoning`, `gemma2_it`, `gemma4_it`, `moonshot_instruct`, `phi4_instruct`, `hunyuan_dense`, `glm4_instruct`, `glm47_flash`, `glm4_z1`; bundled catalog supplies this; omitting defaults to Rust `tinyllama_v1`. */
  chat_template?: string;
  /** ISO `YYYY-MM-DD` for the upstream instruct checkpoint release when known. */
  release_date?: string | null;
  /** Optional vision projector GGUF URL for Chat image attach (mmproj). */
  mmproj_url?: string | null;
  mmproj_sha256?: string | null;
  mmproj_size_bytes?: number | null;
  /**
   * Optional MTP draft GGUF URL. Maguna downloads and stores this when present;
   * the decode path uses in-model MTP heads, not this sidecar, today.
   */
  mtp_draft_url?: string | null;
  mtp_draft_sha256?: string | null;
  mtp_draft_size_bytes?: number | null;
};

/** Resolved model for a mode + optional per-mode override id. */
export type ModeModelBinding = {
  effective_model_id: string | null;
  override_model_id: string | null;
};

export type InstalledModel = {
  id: string;
  display_name: string;
  gguf_path: string;
  sha256: string | null;
  /** Empty or omitted: infer from model id (older manifests). */
  chat_template?: string;
};

/** Role for Chat mode invokes (`run_mode_chat`); must match serde on the Rust side (lowercase). */
export type ChatMessageRole = "user" | "assistant";

/** One Chat mode turn passed to `run_mode_chat` and persisted in session archives. */
export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
};

/** How the app builds the user turn before sending it to the local model (`translate` allows same language in and out, e.g. correction). Chat uses `run_mode_chat` instead of `run_mode`. */
export type PromptLayout = "plain" | "locale" | "translate" | "chat";

/** Mode: system prompt + how the turn is built. Language in/out, when applicable, are set via Edit configuration on the mode page—not for `plain` or `chat` (Chat uses multi-turn Send + `run_mode_chat`). */
/** Matches Rust `GuardrailsSettingsDto`; `enabled` is always true (guardrails cannot be disabled). */
export type GuardrailsSettings = {
  enabled: boolean;
  /** When null or trimmed empty, Maguna uses the built-in guardrail paragraph. */
  customText: string | null;
  /** Canonical built-in policy (from Rust); always supplied by `get_guardrails_settings`. */
  builtInPolicyText: string;
};

/** Matches Rust `ModelThinkingSettingsDto` — when enabled, allows CoT for Qwen / Gemma 4 / GLM-4.7 Flash (DeepSeek-R1 / GLM-Z1 always reason). */
export type ModelThinkingSettings = {
  enabled: boolean;
};

export type ModeDefinition = {
  id: string;
  name: string;
  /** Empty for custom modes is fine; Maguna authors built-in defaults only. */
  system_prompt: string;
  prompt_layout: PromptLayout;
  /** Persisted for schema validation (Rust clamps 64–8192); actual generation budget scales from the formatted user payload (single-turn) or the latest Chat user message, not strictly from this number. */
  max_tokens: number;
  builtin: boolean;
};
