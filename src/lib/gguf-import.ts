/** Basename of a GGUF path (handles Windows and POSIX separators). */
export function ggufBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

/** Suggested display name from a `.gguf` file path (stem without extension). */
export function suggestedImportDisplayName(path: string): string {
  const base = ggufBasename(path);
  const stem = base.replace(/\.gguf$/i, "");
  return stem.trim() || "Imported model";
}
