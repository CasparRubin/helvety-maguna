import { invoke as rawInvoke } from "@tauri-apps/api/core";
import { listen as rawListen } from "@tauri-apps/api/event";

import { isTauri, TAURI_REQUIRED_HINT } from "@/lib/tauri-runtime";

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri()) {
    throw new Error(TAURI_REQUIRED_HINT);
  }
  return rawInvoke(cmd, args as never) as Promise<T>;
}

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  if (!isTauri()) {
    return () => {};
  }
  return rawListen(event, handler);
}
