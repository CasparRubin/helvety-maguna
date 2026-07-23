/** Local-time build id: `yyMMdd-HHmm-ss` (e.g. `260723-1342-12`). */
export function formatBuildStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yy = pad(date.getFullYear() % 100);
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yy}${MM}${dd}-${HH}${mm}-${ss}`;
}
