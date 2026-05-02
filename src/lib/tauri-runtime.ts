/**
 * Tauri injects `window.__TAURI_INTERNALS__` in the app webview only.
 * Opening the Vite dev URL in a normal browser has no bridge: `invoke` throws (see `TAURI_REQUIRED_HINT`);
 * `listen` in `tauri-api.ts` becomes a no-op outside the webview.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TAURI_INTERNALS__?: { invoke?: unknown };
  };
  return typeof w.__TAURI_INTERNALS__?.invoke === "function";
}

export const TAURI_REQUIRED_HINT =
  "Run the desktop app with: bun run dev (Tauri + Vite). Opening only the Vite dev URL in a browser has no Tauri bridge, so catalog and model actions will not work there.";
