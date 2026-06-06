const THINK_OPEN = "<" + "think" + ">";
const THINK_CLOSE = "</" + "think" + ">";
const IM_END = "<|" + "im_end" + "|>";
const IM_SYSTEM = "<|" + "im_system" + "|>";
const IM_USER = "<|" + "im_user" + "|>";
const IM_ASSISTANT = "<|" + "im_assistant" + "|>";
const IM_MIDDLE = "<|" + "im_middle" + "|>";

/** Control tokens and reasoning prefixes that must not appear in user-visible output. */
const TRUNCATE_MARKERS = [
  "<|im_start|>",
  IM_END,
  IM_SYSTEM,
  IM_USER,
  IM_ASSISTANT,
  IM_MIDDLE,
  "<|eot_id|>",
  "<|user|>",
  "<|system|>",
  "<|assistant|>",
  "<|end|>",
  "<|endoftext|>",
  "<|startoftext|>",
  "<|extra_0|>",
  "<|extra_4|>",
  "<|eos|>",
  "</s>",
  "[/INST]",
  "<|start_header_id|>",
  "<start_of_turn>",
  "<end_of_turn>",
  "<|turn>",
  "<turn|>",
  "<|turn>model",
  "<|turn>user",
  "<|turn>system",
  THINK_OPEN,
  THINK_CLOSE,
  "<|channel|>thought",
  "<|channel>thought",
  "<|channel|>analysis",
  "<|channel|>final",
  "<|channel>final",
  "<channel|>",
];

const CHANNEL_FINAL = /<\|?channel\|?>final\s*/i;
const CHANNEL_THOUGHT_PREFIX = /^\s*<\|?channel\|?>thought[^\n]*\n?/i;
const CHANNEL_LEADER = /^<\|?channel\|?>\s*/i;
const CHANNEL_THOUGHT_START = /^\s*<\|?channel\|?>thought\b/i;

export type StripChatArtifactsOptions = {
  /** Keep reasoning traces visible (DeepSeek-R1 and similar). */
  preserveReasoning?: boolean;
};

/** Models that should show chain-of-thought in the UI instead of stripping it. */
export function modelPreservesReasoningTrace(
  modelId: string | null | undefined,
): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  return lower.includes("deepseek-r1") || lower.includes("deepseek_r1");
}

function stripChannelReasoning(text: string): string {
  const finalMatch = text.match(CHANNEL_FINAL);
  if (finalMatch && finalMatch.index !== undefined) {
    return text.slice(finalMatch.index + finalMatch[0].length);
  }
  if (CHANNEL_THOUGHT_PREFIX.test(text)) {
    const afterThought = text.replace(CHANNEL_THOUGHT_PREFIX, "");
    if (CHANNEL_LEADER.test(afterThought)) {
      return afterThought.replace(CHANNEL_LEADER, "");
    }
    if (CHANNEL_THOUGHT_START.test(text)) {
      return "";
    }
    return afterThought;
  }
  if (CHANNEL_THOUGHT_START.test(text)) {
    return "";
  }
  return text;
}

/**
 * Trim model control tokens, reasoning traces, and chat framing echoes from streamed text.
 * Maguna targets polished copy — thinking is disabled in Qwen/Gemma prompts where possible;
 * this is the safety net when a model still emits traces or special tokens.
 */
export function stripChatArtifacts(
  text: string,
  options: StripChatArtifactsOptions = {},
): string {
  let s = text;
  const preserveReasoning = options.preserveReasoning === true;

  if (!preserveReasoning) {
    const thinkCloseIdx = s.lastIndexOf(THINK_CLOSE);
    if (thinkCloseIdx !== -1) {
      s = s.slice(thinkCloseIdx + THINK_CLOSE.length);
    }
    s = stripChannelReasoning(s);
  }

  let end = s.length;
  const markers = preserveReasoning
    ? TRUNCATE_MARKERS.filter(
        (m) => m !== THINK_OPEN && m !== THINK_CLOSE && !m.includes("channel"),
      )
    : TRUNCATE_MARKERS;
  for (const m of markers) {
    const i = s.indexOf(m);
    if (i !== -1 && i < end) end = i;
  }
  s = s.slice(0, end);

  return s.trim();
}

/** Visible streaming text — same rules as the final pass so Chat does not flash reasoning tokens. */
export function visibleInferenceOutput(
  text: string,
  options: StripChatArtifactsOptions = {},
): string {
  return stripChatArtifacts(text, options);
}
