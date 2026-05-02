import { describe, expect, it } from "vitest";

import { resolveEffectiveTheme, type ThemePreference } from "./theme-context";

describe("resolveEffectiveTheme", () => {
  it.each<[ThemePreference, "light" | "dark"]>([
    ["light", "light"],
    ["dark", "dark"],
  ])("maps preference %s to effective %s", (preference, effective) => {
    expect(resolveEffectiveTheme(preference)).toBe(effective);
  });
});
