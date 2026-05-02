const STORAGE_KEY_PREFIX = "maguna.modeRunArchive.v1:";

/** Max entries per mode to limit localStorage size. */
export const MODE_RUN_ARCHIVE_MAX = 400;

export type ModeRunArchiveEntry = {
  id: string;
  createdAt: number;
  input: string;
  output: string;
};

function storageKey(modeId: string): string {
  return `${STORAGE_KEY_PREFIX}${modeId}`;
}

function isEntry(x: unknown): x is ModeRunArchiveEntry {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.input === "string" &&
    typeof o.output === "string"
  );
}

/** Newest first after normalize. */
export function sortArchiveNewestFirst(
  entries: ModeRunArchiveEntry[],
): ModeRunArchiveEntry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt);
}

export function trimArchiveToMax(
  entries: ModeRunArchiveEntry[],
  max = MODE_RUN_ARCHIVE_MAX,
): ModeRunArchiveEntry[] {
  if (entries.length <= max) return entries;
  return entries.slice(0, max);
}

export function loadModeRunArchive(modeId: string): ModeRunArchiveEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(modeId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const list = parsed.filter(isEntry);
    return sortArchiveNewestFirst(list);
  } catch {
    return [];
  }
}

export function saveModeRunArchive(
  modeId: string,
  entries: ModeRunArchiveEntry[],
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey(modeId), JSON.stringify(entries));
  } catch {
    /* quota or private mode */
  }
}

export function clearModeRunArchive(modeId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(storageKey(modeId));
  } catch {
    /* ignore */
  }
}

/** Remove persisted archive for a mode (e.g. after the mode is deleted). */
export function removeModeRunArchiveStorage(modeId: string): void {
  clearModeRunArchive(modeId);
}
