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
  "Run the desktop app with: npm run dev (uses Tauri). Do not open the Vite URL in Chrome/Edge alone.";
