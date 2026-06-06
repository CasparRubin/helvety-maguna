import { describe, expect, it } from "vitest";

import type { CatalogEntry } from "@/lib/types";
import {
  formatApproxDownloadGb,
  formatCatalogReleaseDate,
  RECOMMENDED_CATALOG_MODEL_ID,
  sortCatalogBySizeAscending,
} from "@/lib/catalog-order";
import { SHIPPED_CATALOG } from "@/lib/shipped-catalog";

function entry(id: string, display_name: string, size_bytes: number): CatalogEntry {
  return {
    id,
    maker: "Test",
    display_name,
    description: "d",
    url: "https://example.com/m.gguf",
    sha256: null,
    size_bytes,
    languages: ["en"],
    license_note: "MIT",
    hf_repo: "test/repo",
    chat_template: "llama3_instruct",
  };
}

describe("sortCatalogBySizeAscending", () => {
  it("orders by size_bytes ascending", () => {
    const sorted = sortCatalogBySizeAscending([
      entry("large", "Large", 9_000_000_000),
      entry("small", "Small", 4_000_000_000),
      entry("mid", "Mid", 5_000_000_000),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["small", "mid", "large"]);
  });

  it("breaks ties by display_name", () => {
    const sorted = sortCatalogBySizeAscending([
      entry("b", "Zebra", 100),
      entry("a", "Alpha", 100),
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("handles same sizes as shipped catalog quants", () => {
    const sorted = sortCatalogBySizeAscending([
      entry("deepseek-r1-distill-qwen-7b-q4km", "DeepSeek R1", 4_683_073_504),
      entry("qwen3-8b-q4km", "Qwen 3 8B", 5_027_784_224),
      entry("ministral-3-8b-instruct-q4km", "Ministral 3 8B", 5_198_387_456),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([
      "deepseek-r1-distill-qwen-7b-q4km",
      "qwen3-8b-q4km",
      "ministral-3-8b-instruct-q4km",
    ]);
  });

  it("orders full shipped catalog v5 by download size ascending", () => {
    const sorted = sortCatalogBySizeAscending(SHIPPED_CATALOG.models);
    expect(sorted.map((e) => e.id)).toEqual([
      "deepseek-r1-distill-qwen-7b-q4km",
      "qwen3-8b-q4km",
      "ministral-3-8b-instruct-q4km",
      "gemma-4-12b-it-q4km",
      "qwen3-14b-q4km",
    ]);
  });
});

describe("RECOMMENDED_CATALOG_MODEL_ID", () => {
  it("matches a model in the shipped catalog", () => {
    const ids = SHIPPED_CATALOG.models.map((m) => m.id);
    expect(ids).toContain(RECOMMENDED_CATALOG_MODEL_ID);
  });
});

describe("formatCatalogReleaseDate", () => {
  it("formats valid YYYY-MM-DD in UTC", () => {
    expect(formatCatalogReleaseDate("2024-05-22")).toMatch(/May/i);
    expect(formatCatalogReleaseDate("2024-05-22")).toMatch(/2024/);
  });

  it("returns null for empty or invalid input", () => {
    expect(formatCatalogReleaseDate(null)).toBeNull();
    expect(formatCatalogReleaseDate(undefined)).toBeNull();
    expect(formatCatalogReleaseDate("")).toBeNull();
    expect(formatCatalogReleaseDate("not-a-date")).toBeNull();
    expect(formatCatalogReleaseDate("2024-5-22")).toBeNull();
  });
});

describe("formatApproxDownloadGb", () => {
  it("uses one decimal below 10 GB", () => {
    expect(formatApproxDownloadGb(1_800_000_000)).toBe("~1.8 GB");
  });

  it("uses one decimal at 10 GB and above", () => {
    expect(formatApproxDownloadGb(10_500_000_000)).toBe("~10.5 GB");
  });

  it("drops trailing .0 for whole gigabytes", () => {
    expect(formatApproxDownloadGb(8_000_000_000)).toBe("~8 GB");
  });

  it("formats zero and small sizes", () => {
    expect(formatApproxDownloadGb(0)).toBe("~0 GB");
    expect(formatApproxDownloadGb(500_000_000)).toBe("~0.5 GB");
  });
});
