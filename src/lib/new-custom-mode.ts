import type { ModeDefinition } from "./types";

export type NewCustomModeKind = "chat" | "simple";

/** Factory for modes created from the sidebar “Add mode” actions. */
export function createNewCustomMode(kind: NewCustomModeKind): ModeDefinition {
  const id = `mode-${crypto.randomUUID()}`;
  if (kind === "chat") {
    return {
      id,
      name: "New chat mode",
      system_prompt: "",
      prompt_layout: "chat",
      max_tokens: 2048,
      builtin: false,
    };
  }
  return {
    id,
    name: "New mode",
    system_prompt: "",
    prompt_layout: "plain",
    max_tokens: 768,
    builtin: false,
  };
}
