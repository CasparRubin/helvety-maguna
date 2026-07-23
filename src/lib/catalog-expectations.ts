/**
 * Single source of truth for bundled catalog v9 test expectations.
 * Keep in sync with `src-tauri/src/catalog.rs` and `src-tauri/resources/catalog.json`.
 */
export const EXPECTED_V9_CATALOG_MODELS = [
  {
    id: "ministral-3-3b-instruct-q4km",
    chat_template: "mistral3_instruct",
    size_bytes: 2_146_498_528,
  },
  {
    id: "phi-4-mini-instruct-q4km",
    chat_template: "phi4_instruct",
    size_bytes: 2_491_874_688,
  },
  {
    id: "qwen3.5-4b-q4km",
    chat_template: "qwen2_instruct",
    size_bytes: 3_013_027_808,
  },
  {
    id: "hy-mt15-7b-q4km",
    chat_template: "hunyuan_dense",
    size_bytes: 4_624_649_312,
  },
  {
    id: "deepseek-r1-0528-qwen3-8b-q4km",
    chat_template: "qwen2_instruct_reasoning",
    size_bytes: 5_027_783_040,
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
    size_bytes: 7_121_861_440,
  },
  {
    id: "ministral-3-14b-instruct-q4km",
    chat_template: "mistral3_instruct",
    size_bytes: 8_239_068_576,
  },
  {
    id: "gemma-4-26b-a4b-it-q4km",
    chat_template: "gemma4_it",
    size_bytes: 17_035_038_112,
  },
  {
    id: "qwen3.6-27b-q4km",
    chat_template: "qwen2_instruct",
    size_bytes: 17_984_872_960,
  },
  {
    id: "glm-4.7-flash-q4km",
    chat_template: "glm47_flash",
    size_bytes: 18_474_983_296,
  },
] as const;

/** Catalog ids in ascending `size_bytes` order (matches Rust `catalog_size_order_when_sorted`). */
export const EXPECTED_V9_SIZE_ORDER = EXPECTED_V9_CATALOG_MODELS.map((m) => m.id);

export const LEGACY_V4_CATALOG_IDS = [
  "qwen2.5-14b-instruct-q4km",
  "qwen2.5-7b-instruct-q4km",
  "gemma-2-9b-it-q4km",
  "mistral-7b-instruct-v03-q4km",
] as const;

export const LEGACY_V5_CATALOG_IDS = ["qwen3-8b-q4km"] as const;

export const LEGACY_V7_CATALOG_IDS = ["qwen3-14b-q4km"] as const;

/** Retired when catalog moved to v9 (R1-0528 + HY-MT1.5 replacements). */
export const LEGACY_V8_CATALOG_IDS = [
  "deepseek-r1-distill-qwen-7b-q4km",
  "hunyuan-mt-7b-q4km",
] as const;
