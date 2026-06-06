import { describe, expect, it } from "vitest";

import { SHIPPED_CATALOG } from "@/lib/shipped-catalog";

/** Keep in sync with `src-tauri/src/catalog.rs` v6 expectations. */
const EXPECTED_V6_CATALOG: Array<{
  id: string;
  chat_template: string;
  size_bytes: number;
}> = [
  {
    id: "phi-4-mini-instruct-q4km",
    chat_template: "phi4_instruct",
    size_bytes: 2_491_874_688,
  },
  {
    id: "deepseek-r1-distill-qwen-7b-q4km",
    chat_template: "qwen2_instruct_reasoning",
    size_bytes: 4_683_073_504,
  },
  {
    id: "hunyuan-mt-7b-q4km",
    chat_template: "hunyuan_dense",
    size_bytes: 4_702_111_200,
  },
  {
    id: "ministral-3-8b-instruct-q4km",
    chat_template: "mistral3_instruct",
    size_bytes: 5_198_387_456,
  },
  {
    id: "qwen3.5-9b-q4km",
    chat_template: "qwen2_instruct",
    size_bytes: 6_169_341_984,
  },
  {
    id: "gemma-4-12b-it-q4km",
    chat_template: "gemma4_it",
    size_bytes: 7_381_382_048,
  },
  {
    id: "qwen3-14b-q4km",
    chat_template: "qwen2_instruct",
    size_bytes: 9_001_753_632,
  },
  {
    id: "qwen3.6-27b-q4km",
    chat_template: "qwen2_instruct",
    size_bytes: 16_547_398_784,
  },
];

const LEGACY_V4_IDS = [
  "qwen2.5-14b-instruct-q4km",
  "qwen2.5-7b-instruct-q4km",
  "gemma-2-9b-it-q4km",
  "mistral-7b-instruct-v03-q4km",
] as const;

const LEGACY_V5_IDS = ["qwen3-8b-q4km"] as const;

describe("SHIPPED_CATALOG", () => {
  it("is catalog schema version 6 with eight models", () => {
    expect(SHIPPED_CATALOG.version).toBe(6);
    expect(SHIPPED_CATALOG.models).toHaveLength(8);
  });

  it("lists every v6 catalog id with the expected chat template and size", () => {
    const byId = new Map(SHIPPED_CATALOG.models.map((m) => [m.id, m]));
    for (const expected of EXPECTED_V6_CATALOG) {
      const model = byId.get(expected.id);
      expect(model, `missing catalog model ${expected.id}`).toBeDefined();
      expect(model!.chat_template).toBe(expected.chat_template);
      expect(model!.size_bytes).toBe(expected.size_bytes);
    }
    expect([...byId.keys()].sort()).toEqual(
      EXPECTED_V6_CATALOG.map((m) => m.id).sort(),
    );
  });

  it("does not include retired v4 catalog ids", () => {
    const ids = SHIPPED_CATALOG.models.map((m) => m.id);
    for (const legacy of LEGACY_V4_IDS) {
      expect(ids).not.toContain(legacy);
    }
  });

  it("does not include retired v5 catalog ids", () => {
    const ids = SHIPPED_CATALOG.models.map((m) => m.id);
    for (const legacy of LEGACY_V5_IDS) {
      expect(ids).not.toContain(legacy);
    }
  });
});
