/** Presets for how many tokens the model may generate (local inference `n_predict`-style cap). */
export const REPLY_LENGTH_OPTIONS: { tokens: number; label: string; hint: string }[] = [
  {
    tokens: 384,
    label: "Short",
    hint: "A few sentences — fixes, short replies",
  },
  {
    tokens: 768,
    label: "Typical",
    hint: "About one paragraph",
  },
  {
    tokens: 1024,
    label: "Longer",
    hint: "Multiple paragraphs or a detailed answer",
  },
  {
    tokens: 2048,
    label: "Long form",
    hint: "Several paragraphs",
  },
  {
    tokens: 4096,
    label: "Very long",
    hint: "Up to a short article (slower)",
  },
];

export function nearestReplyLengthTokens(current: number): number {
  const list = REPLY_LENGTH_OPTIONS.map((o) => o.tokens);
  let best = list[0]!;
  for (const n of list) {
    if (Math.abs(n - current) < Math.abs(best - current)) {
      best = n;
    }
  }
  return best;
}
