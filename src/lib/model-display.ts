export function compactModelDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  const looksLikeVerboseDefault = /(\bInstruct\b|\bIT\b|\(Q[\d_]+)/i.test(trimmed);
  if (!looksLikeVerboseDefault) {
    return trimmed;
  }

  const upToParamCount = trimmed.match(/^(.*?\b\d+(?:\.\d+)?B)\b/i);
  if (upToParamCount) {
    return upToParamCount[1].trim();
  }

  return trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim();
}
