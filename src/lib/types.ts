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
  /** e.g. `tinyllama_v1`, `llama3_instruct`, `mistral_instruct`, `qwen2_instruct`, `gemma2_it`, `moonshot_instruct`; bundled catalog supplies this; omitting defaults to Rust `tinyllama_v1`. */
  chat_template?: string;
  /** ISO `YYYY-MM-DD` for the upstream instruct checkpoint release when known. */
  release_date?: string | null;
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

/** Mode: system prompt + how the turn is built. Language in/out apply on the mode page for layouts that need them—not for `plain` or `chat` (Chat uses multi-turn Send + `run_mode_chat`). */
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
