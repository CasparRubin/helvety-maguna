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
  "<|begin_of_text|>",
  "<|eot_id|>",
  "<|end_header_id|>",
  "<|start_header_id|>",
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
  "<s>",
  "[INST]",
  "[/INST]",
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
  "[gMASK]",
  "<sop>",
  "/nothink",
];

/** Role / framing tokens — always truncate even when reasoning text is kept. */
const ROLE_TRUNCATE_MARKERS = TRUNCATE_MARKERS.filter(
  (m) => m !== THINK_OPEN && m !== THINK_CLOSE && !m.includes("channel"),
);

const CHANNEL_FINAL = /<\|?channel\|?>final\s*/i;
const CHANNEL_THOUGHT_PREFIX = /^\s*<\|?channel\|?>thought[^\n]*\n?/i;
const CHANNEL_LEADER = /^<\|?channel\|?>\s*/i;
const CHANNEL_THOUGHT_START = /^\s*<\|?channel\|?>thought\b/i;
/** Named channel headers (thought / analysis / final); keep surrounding prose. */
const CHANNEL_NAMED = /<\|?channel\|?>(?:thought|analysis|final)\b[^\n]*\n?/gi;
/** Bare channel closers (`<channel|>`, `<|channel|>`); tag only, not the rest of the line. */
const CHANNEL_BARE = /<\|?channel\|?>/gi;

const THINK_BLOCK = new RegExp(`${THINK_OPEN}[\\s\\S]*?${THINK_CLOSE}`, "g");

/** Drop closed think blocks and truncate at an incomplete open think tag (streaming). */
function stripThinkBlocks(text: string): string {
  let s = text.replace(THINK_BLOCK, "");
  const openIdx = s.indexOf(THINK_OPEN);
  if (openIdx !== -1) {
    s = s.slice(0, openIdx);
  }
  return s;
}

/**
 * Remove think/channel markup while keeping reasoning and answer prose.
 * Used when Thinking is on (Settings / mode toggle), or for DeepSeek-R1 / GLM-Z1.
 */
function unwrapReasoningTags(text: string): string {
  return text
    .split(THINK_OPEN)
    .join("")
    .split(THINK_CLOSE)
    .join("")
    .replace(CHANNEL_NAMED, "")
    .replace(CHANNEL_BARE, "");
}

export type StripChatArtifactsOptions = {
  /**
   * Keep reasoning *text* visible (UI **Thinking is on**, or DeepSeek-R1 / GLM-Z1 models).
   * Structural tags are still removed.
   */
  preserveReasoning?: boolean;
};

/** Models that keep chain-of-thought *prose* visible (markup tags are still stripped). */
export function modelPreservesReasoningTrace(
  modelId: string | null | undefined,
): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  return (
    lower.includes("deepseek-r1") ||
    lower.includes("deepseek_r1") ||
    lower.includes("glm-z1") ||
    lower.includes("glm_z1")
  );
}

/**
 * Keep CoT prose visible when the Settings toggle is on or the loaded model is a
 * reasoning import. Structural think/channel tags are still removed either way.
 */
export function shouldPreserveReasoningTrace(
  modelId: string | null | undefined,
  enableModelThinking: boolean,
): boolean {
  return enableModelThinking || modelPreservesReasoningTrace(modelId);
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
  // Bare channel closer at start (thinking-off echo without a thought line).
  if (CHANNEL_LEADER.test(text)) {
    return text.replace(CHANNEL_LEADER, "");
  }
  return text;
}

function truncateAtMarkers(text: string, markers: readonly string[]): string {
  let end = text.length;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i !== -1 && i < end) end = i;
  }
  return text.slice(0, end);
}

/**
 * Trim model control/framing tokens from streamed text. By default also discards
 * reasoning *content* (Thinking is off). Maguna defaults to thinking off in
 * Qwen/Gemma/GLM-4.7 prompts (empty think / `/nothink`) unless Settings / the
 * mode-page toggle is set to **Thinking is on**. When thinking is on (or the model is
 * DeepSeek-R1 / GLM-Z1), pass `preserveReasoning: true` so reasoning prose stays
 * visible; think/channel markup and role tokens are still removed either way.
 */
export function stripChatArtifacts(
  text: string,
  options: StripChatArtifactsOptions = {},
): string {
  let s = text;
  const preserveReasoning = options.preserveReasoning === true;

  if (preserveReasoning) {
    s = unwrapReasoningTags(s);
    s = truncateAtMarkers(s, ROLE_TRUNCATE_MARKERS);
  } else {
    const thinkCloseIdx = s.lastIndexOf(THINK_CLOSE);
    if (thinkCloseIdx !== -1) {
      s = s.slice(thinkCloseIdx + THINK_CLOSE.length);
    }
    s = stripThinkBlocks(s);
    s = stripChannelReasoning(s);
    s = truncateAtMarkers(s, TRUNCATE_MARKERS);
  }

  return s.trim();
}

/** Visible streaming text — same rules as the final pass so Chat does not flash control markup. */
export function visibleInferenceOutput(
  text: string,
  options: StripChatArtifactsOptions = {},
): string {
  return stripChatArtifacts(text, options);
}
