/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";

import { isTauri, TAURI_REQUIRED_HINT } from "./tauri-runtime";

describe("isTauri", () => {
  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("is false without the Tauri bridge", () => {
    expect(isTauri()).toBe(false);
  });

  it("is true when __TAURI_INTERNALS__.invoke is a function", () => {
    (
      window as unknown as { __TAURI_INTERNALS__: { invoke: () => unknown } }
    ).__TAURI_INTERNALS__ = { invoke: () => undefined };
    expect(isTauri()).toBe(true);
  });

  it("exports a hint that mentions bun run dev", () => {
    expect(TAURI_REQUIRED_HINT).toMatch(/bun run dev/);
  });
});
