import type { CatalogEntry } from "@/lib/types";

/** Best-first quality order (ignores download size). Ids not listed sort after, by name. */
const RECOMMENDATION_ORDER: readonly string[] = [
  "qwen2.5-14b-instruct-q4km",
  "moonlight-16b-a3b-instruct-q4ks",
  "deepseek-r1-distill-llama-8b-q5km",
  "gemma-2-9b-it-q4km",
  "mistral-7b-instruct-v03-q5km",
  "qwen2.5-7b-instruct-q4km",
  "deepseek-r1-distill-llama-8b-q4km",
  "mistral-7b-instruct-v03-q4km",
  "qwen2.5-coder-7b-instruct-q4km",
  "gemma-2-2b-it-q4km",
  "llama-3.2-3b-instruct-q4km",
  "tinyllama-1.1b-chat-q4km",
];

const ORDER_INDEX = new Map(RECOMMENDATION_ORDER.map((id, index) => [id, index]));

export function sortCatalogByRecommendation(entries: CatalogEntry[]): CatalogEntry[] {
  return [...entries].sort((a, b) => {
    const ia = ORDER_INDEX.get(a.id) ?? 1_000;
    const ib = ORDER_INDEX.get(b.id) ?? 1_000;
    if (ia !== ib) return ia - ib;
    return a.display_name.localeCompare(b.display_name);
  });
}

export function formatApproxDownloadGb(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  const decimals = gb >= 10 ? 1 : 2;
  return `~${gb.toFixed(decimals)} GB`;
}
