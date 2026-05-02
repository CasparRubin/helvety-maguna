/** Trim if the model starts a new chat turn or special tokens. */
export function stripChatArtifacts(text: string): string {
  const markers = [
    "<|eot_id|>",
    "<|user|>",
    "<|system|>",
    "<|assistant|>",
    "</s>",
    "[/INST]",
    "<|start_header_id|>",
  ];
  let end = text.length;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i !== -1 && i < end) end = i;
  }
  // Some GGUF templates emit an initial leading space before the first token.
  return text.slice(0, end).trim();
}
