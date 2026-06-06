import { describe, expect, it } from "vitest";

import { SHIPPED_CATALOG } from "@/lib/shipped-catalog";

describe("SHIPPED_CATALOG", () => {
  it("is catalog schema version 5 with five models", () => {
    expect(SHIPPED_CATALOG.version).toBe(5);
    expect(SHIPPED_CATALOG.models).toHaveLength(5);
  });

  it("does not include retired v4 catalog ids", () => {
    const ids = SHIPPED_CATALOG.models.map((m) => m.id);
    expect(ids).not.toContain("qwen2.5-14b-instruct-q4km");
    expect(ids).not.toContain("qwen2.5-7b-instruct-q4km");
    expect(ids).not.toContain("gemma-2-9b-it-q4km");
    expect(ids).not.toContain("mistral-7b-instruct-v03-q4km");
  });
});
