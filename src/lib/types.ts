export type CatalogEntry = {
  id: string;
  display_name: string;
  description: string;
  url: string;
  sha256: string | null;
  size_bytes: number;
  languages: string[];
  license_note: string;
  hf_repo: string;
  /** e.g. `tinyllama_v1`, `llama3_instruct`, `mistral_instruct`, `qwen2_instruct`, `gemma2_it`, `moonshot_instruct`; omitted defaults server-side. */
  chat_template?: string;
};

export type InstalledModel = {
  id: string;
  display_name: string;
  gguf_path: string;
  sha256: string | null;
  /** Empty or omitted: infer from model id (older manifests). */
  chat_template?: string;
};

/** Local inference mode: optional system string + user template (`{{input}}`; optional `{{locale}}`, `{{from}}`, `{{to}}`). */
export type ModeDefinition = {
  id: string;
  name: string;
  /** Empty for custom modes is fine; Maguna only authors defaults for built-in correction + translate. */
  system_prompt: string;
  user_message_template: string;
  max_tokens: number;
  builtin: boolean;
};
