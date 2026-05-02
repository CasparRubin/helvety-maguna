import type { CatalogEntry } from "@/lib/types";

/**
 * Catalog entry id that shows the “Recommended” badge and card highlight.
 * Independent of sort order (catalog is listed smallest → largest download).
 */
export const RECOMMENDED_CATALOG_MODEL_ID = "mistral-7b-instruct-v03-q4km";

/** Sort by `size_bytes` ascending, then `display_name` for stable ties. */
export function sortCatalogBySizeAscending(entries: CatalogEntry[]): CatalogEntry[] {
  return [...entries].sort((a, b) => {
    if (a.size_bytes !== b.size_bytes) return a.size_bytes - b.size_bytes;
    return a.display_name.localeCompare(b.display_name);
  });
}

export function formatApproxDownloadGb(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  const rounded = gb.toFixed(1);
  const label = rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded;
  return `~${label} GB`;
}

/** `YYYY-MM-DD` from bundled catalog → locale-friendly label, or null if missing/invalid. */
export function formatCatalogReleaseDate(
  iso: string | null | undefined,
): string | null {
  const s = typeof iso === "string" ? iso.trim() : "";
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(t));
}
