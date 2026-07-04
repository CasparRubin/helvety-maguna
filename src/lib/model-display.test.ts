import { describe, expect, it } from "vitest";

import { compactModelDisplayName } from "@/lib/model-display";
import { SHIPPED_CATALOG } from "@/lib/shipped-catalog";

describe("compactModelDisplayName", () => {
  it("keeps every shipped catalog display name unchanged", () => {
    for (const model of SHIPPED_CATALOG.models) {
      expect(compactModelDisplayName(model.display_name), model.id).toBe(
        model.display_name,
      );
    }
  });

  it("still compacts legacy verbose catalog / import names", () => {
    expect(compactModelDisplayName("Mistral 7B Instruct v0.3 (Q4_K_M)")).toBe(
      "Mistral 7B",
    );
    expect(compactModelDisplayName("Qwen 2.5 14B Instruct (Q4_K_M)")).toBe(
      "Qwen 2.5 14B",
    );
    expect(compactModelDisplayName("Gemma 2 9B IT (Q4_K_M)")).toBe("Gemma 2 9B");
  });

  it("preserves non-verbose names", () => {
    expect(compactModelDisplayName("DeepSeek R1 Distill Qwen 7B")).toBe(
      "DeepSeek R1 Distill Qwen 7B",
    );
    expect(compactModelDisplayName("Custom Team Model")).toBe("Custom Team Model");
  });

  it("trims trailing parenthesized quant suffix when no parameter pattern match exists", () => {
    expect(compactModelDisplayName("Model Alpha (Q5_K_M)")).toBe("Model Alpha");
  });

  it("trims outer whitespace", () => {
    expect(compactModelDisplayName("  Custom  ")).toBe("Custom");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(compactModelDisplayName("   ")).toBe("");
  });
});
