/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { invoke as rawInvoke } from "@tauri-apps/api/core";
import { listen as rawListen } from "@tauri-apps/api/event";

import { invoke, listen } from "./tauri-api";
import { TAURI_REQUIRED_HINT } from "./tauri-runtime";

describe("tauri-api wrappers", () => {
  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it("invoke throws the browser hint when not in Tauri", async () => {
    await expect(invoke("get_modes")).rejects.toThrow(TAURI_REQUIRED_HINT);
    expect(rawInvoke).not.toHaveBeenCalled();
  });

  it("listen returns a no-op unsubscribe outside Tauri", async () => {
    const unsub = await listen("inference-chunk", () => {});
    expect(typeof unsub).toBe("function");
    expect(rawListen).not.toHaveBeenCalled();
    unsub();
  });

  it("invoke and listen delegate when the Tauri bridge is present", async () => {
    (
      window as unknown as { __TAURI_INTERNALS__: { invoke: () => unknown } }
    ).__TAURI_INTERNALS__ = { invoke: () => undefined };
    vi.mocked(rawInvoke).mockResolvedValue("ok" as never);
    vi.mocked(rawListen).mockResolvedValue((() => {}) as never);

    await expect(invoke<string>("get_modes")).resolves.toBe("ok");
    expect(rawInvoke).toHaveBeenCalledWith("get_modes", undefined);

    const handler = vi.fn();
    await listen("inference-done", handler);
    expect(rawListen).toHaveBeenCalledWith("inference-done", handler);
  });
});
