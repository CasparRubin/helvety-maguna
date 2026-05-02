import { describe, expect, it } from "vitest";

import { resolveEffectiveTheme } from "./theme-context";

describe("resolveEffectiveTheme", () => {
  it("returns the selected explicit theme", () => {
    expect(resolveEffectiveTheme("light")).toBe("light");
    expect(resolveEffectiveTheme("dark")).toBe("dark");
  });
});
