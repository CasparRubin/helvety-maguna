import { describe, expect, it } from "vitest";

import { formatBuildStamp } from "./build-stamp";

describe("formatBuildStamp", () => {
  it("formats local time as yyMMdd-HHmm-ss", () => {
    // Fixed instant; assertions use the same local getters the formatter uses.
    const d = new Date(2026, 6, 23, 13, 42, 12);
    expect(formatBuildStamp(d)).toBe("260723-1342-12");
  });

  it("zero-pads single-digit fields", () => {
    const d = new Date(2026, 0, 5, 9, 3, 4);
    expect(formatBuildStamp(d)).toBe("260105-0903-04");
  });
});
