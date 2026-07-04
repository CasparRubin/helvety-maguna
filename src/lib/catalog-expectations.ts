/**
 * Single source of truth for bundled catalog v7 test expectations.
 * Keep in sync with `src-tauri/src/catalog.rs` and `src-tauri/resources/catalog.json`.
 */
export const EXPECTED_V7_CATALOG_MODELS = [
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
    id: "glm-4-9b-0414-q4km",
    chat_template: "glm4_instruct",
    size_bytes: 6_166_574_464,
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
  {
    id: "glm-4.7-flash-q4km",
    chat_template: "glm47_flash",
    size_bytes: 18_474_983_296,
  },
] as const;

/** Catalog ids in ascending `size_bytes` order (matches Rust `catalog_size_order_when_sorted`). */
export const EXPECTED_V7_SIZE_ORDER = EXPECTED_V7_CATALOG_MODELS.map((m) => m.id);

export const LEGACY_V4_CATALOG_IDS = [
  "qwen2.5-14b-instruct-q4km",
  "qwen2.5-7b-instruct-q4km",
  "gemma-2-9b-it-q4km",
  "mistral-7b-instruct-v03-q4km",
] as const;

export const LEGACY_V5_CATALOG_IDS = ["qwen3-8b-q4km"] as const;
