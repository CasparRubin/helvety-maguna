import { describe, expect, it } from "vitest";
import { createNewCustomMode } from "./new-custom-mode";

describe("createNewCustomMode", () => {
  it("creates a non-builtin chat mode with expected defaults", () => {
    const m = createNewCustomMode("chat");
    expect(m.builtin).toBe(false);
    expect(m.system_prompt).toBe("");
    expect(m.name).toBe("New chat mode");
    expect(m.prompt_layout).toBe("chat");
    expect(m.max_tokens).toBe(2048);
    expect(m.id).toMatch(/^mode-[0-9a-f-]{36}$/i);
  });

  it("creates a non-builtin simple (plain) mode with expected defaults", () => {
    const m = createNewCustomMode("simple");
    expect(m.builtin).toBe(false);
    expect(m.system_prompt).toBe("");
    expect(m.name).toBe("New mode");
    expect(m.prompt_layout).toBe("plain");
    expect(m.max_tokens).toBe(768);
    expect(m.id).toMatch(/^mode-[0-9a-f-]{36}$/i);
  });

  it("returns distinct ids across calls", () => {
    const a = createNewCustomMode("chat").id;
    const b = createNewCustomMode("chat").id;
    expect(a).not.toBe(b);
  });
});
