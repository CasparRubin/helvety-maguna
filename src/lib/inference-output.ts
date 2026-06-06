const THINK_OPEN = "<" + "think" + ">";
const THINK_CLOSE = "</" + "think" + ">";

/** Trim if the model starts a new chat turn, special tokens, or a reasoning trace. */
export function stripChatArtifacts(text: string): string {
  const markers = [
    "<|eot_id|>",
    "<|user|>",
    "<|system|>",
    "<|assistant|>",
    "</s>",
    "[/INST]",
    "<|start_header_id|>",
    THINK_OPEN,
    THINK_CLOSE,
    "<|channel|>thought",
  ];
  let end = text.length;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i !== -1 && i < end) end = i;
  }
  // Some GGUF templates emit an initial leading space before the first token.
  return text.slice(0, end).trim();
}
