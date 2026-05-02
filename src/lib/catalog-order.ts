import type { CatalogEntry } from "@/lib/types";

/** Best-first quality order (ignores download size). Ids not listed sort after, by name. */
const RECOMMENDATION_ORDER: readonly string[] = [
  "qwen2.5-14b-instruct-q4km",
  "gemma-2-9b-it-q4km",
  "qwen2.5-7b-instruct-q4km",
  "mistral-7b-instruct-v03-q4km",
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
  const rounded = gb.toFixed(1);
  const label = rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
  return `~${label} GB`;
}
