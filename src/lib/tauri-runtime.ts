/**
 * Tauri injects `window.__TAURI_INTERNALS__` in the app webview only.
 * Opening http://localhost:1420 in a normal browser (plain `vite`) has no bridge — invoke/listen will throw.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: unknown };
  };
  return typeof w.__TAURI_INTERNALS__?.invoke === "function";
}

export const TAURI_REQUIRED_HINT =
  "Run the full app with: bun run dev (Tauri + Vite). The Vite-only URL has no Tauri bridge — do not use it for IPC or inference.";
