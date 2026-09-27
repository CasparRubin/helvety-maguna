/**
 * Single source of truth for bundled catalog v10 test expectations.
 * Keep in sync with `src-tauri/src/catalog.rs` and `src-tauri/resources/catalog.json`.
 */
export const EXPECTED_V10_CATALOG_MODELS = [
  {
    id: "ministral-3-3b-instruct-q4km",
    chat_template: "mistral3_instruct",
    size_bytes: 2_146_498_528,
  },
  {
    id: "qwen3.5-4b-q4km",
    chat_template: "qwen2_instruct",
    size_bytes: 3_013_027_808,
  },
  {
    id: "hy-mt2-7b-q4km",
    chat_template: "hunyuan_dense",
    size_bytes: 4_624_648_896,
  },
  {
    id: "gemma-4-e4b-it-q4km",
    chat_template: "gemma4_it",
    size_bytes: 4_977_171_584,
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
    id: "gpt-oss-20b-q4km",
    chat_template: "gpt_oss",
    size_bytes: 11_673_418_816,
  },
  {
    id: "qwen3.8-27b-q4km",
    chat_template: "qwen2_instruct",
    size_bytes: 16_464_440_224,
  },
  {
    id: "muse-glimmer-30b-q4km",
    chat_template: "muse_glimmer",
    size_bytes: 16_756_683_904,
  },
  {
    id: "gemma-4-26b-a4b-it-q4km",
    chat_template: "gemma4_it",
    size_bytes: 17_035_038_112,
  },
  {
    id: "glm-4.7-flash-q4km",
    chat_template: "glm47_flash",
    size_bytes: 18_474_983_296,
  },
] as const;

/** Catalog ids in ascending `size_bytes` order (matches Rust `catalog_size_order_when_sorted`). */
export const EXPECTED_V10_SIZE_ORDER = EXPECTED_V10_CATALOG_MODELS.map((m) => m.id);

export const LEGACY_V4_CATALOG_IDS = [
  "qwen2.5-14b-instruct-q4km",
  "qwen2.5-7b-instruct-q4km",
  "gemma-2-9b-it-q4km",
  "mistral-7b-instruct-v03-q4km",
] as const;

export const LEGACY_V5_CATALOG_IDS = ["qwen3-8b-q4km"] as const;

export const LEGACY_V7_CATALOG_IDS = ["qwen3-14b-q4km"] as const;

/** Dropped in catalog v8. */
export const LEGACY_V8_CATALOG_IDS = [
  "deepseek-r1-distill-qwen-7b-q4km",
  "hunyuan-mt-7b-q4km",
] as const;

/** Dropped in catalog v10. */
export const LEGACY_V9_CATALOG_IDS = [
  "phi-4-mini-instruct-q4km",
  "hy-mt15-7b-q4km",
  "qwen3.6-27b-q4km",
  "deepseek-r1-0528-qwen3-8b-q4km",
] as const;
