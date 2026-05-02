import { describe, expect, it } from "vitest";

import { resolveEffectiveTheme } from "./theme-context";

describe("resolveEffectiveTheme", () => {
  it("respects explicit light and dark", () => {
    expect(resolveEffectiveTheme("light", false)).toBe("light");
    expect(resolveEffectiveTheme("light", true)).toBe("light");
    expect(resolveEffectiveTheme("dark", false)).toBe("dark");
    expect(resolveEffectiveTheme("dark", true)).toBe("dark");
  });

  it("follows system when preference is system", () => {
    expect(resolveEffectiveTheme("system", false)).toBe("light");
    expect(resolveEffectiveTheme("system", true)).toBe("dark");
  });
});
