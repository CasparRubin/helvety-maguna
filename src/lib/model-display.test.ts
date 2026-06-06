import { describe, expect, it } from "vitest";

import { compactModelDisplayName } from "@/lib/model-display";

describe("compactModelDisplayName", () => {
  it("keeps shipped catalog v6 display names unchanged", () => {
    expect(compactModelDisplayName("Phi-4 mini")).toBe("Phi-4 mini");
    expect(compactModelDisplayName("Hunyuan-MT 7B")).toBe("Hunyuan-MT 7B");
    expect(compactModelDisplayName("Qwen 3.5 9B")).toBe("Qwen 3.5 9B");
    expect(compactModelDisplayName("Qwen 3.6 27B")).toBe("Qwen 3.6 27B");
    expect(compactModelDisplayName("Qwen 3 14B")).toBe("Qwen 3 14B");
    expect(compactModelDisplayName("Gemma 4 12B")).toBe("Gemma 4 12B");
    expect(compactModelDisplayName("Ministral 3 8B")).toBe("Ministral 3 8B");
    expect(compactModelDisplayName("DeepSeek R1 Distill Qwen 7B")).toBe(
      "DeepSeek R1 Distill Qwen 7B",
    );
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
