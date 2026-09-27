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
    expect(compactModelDisplayName("DeepSeek R1 Distill Qwen 7B (Q4_K_M)")).toBe(
      "DeepSeek R1 Distill Qwen 7B",
    );
  });

  it("preserves names that are already compact", () => {
    expect(compactModelDisplayName("Hy-MT2 7B")).toBe("Hy-MT2 7B");
    expect(compactModelDisplayName("gpt-oss 20B")).toBe("gpt-oss 20B");
    expect(compactModelDisplayName("Muse Glimmer 30B")).toBe("Muse Glimmer 30B");
    expect(compactModelDisplayName("Gemma 4 E4B")).toBe("Gemma 4 E4B");
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
