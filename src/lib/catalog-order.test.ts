import { describe, expect, it } from "vitest";

import type { CatalogEntry } from "@/lib/types";
import {
  formatApproxDownloadGb,
  sortCatalogByRecommendation,
} from "@/lib/catalog-order";

function entry(id: string, display_name: string): CatalogEntry {
  return {
    id,
    maker: "Test",
    display_name,
    description: "d",
    url: "https://example.com/m.gguf",
    sha256: null,
    size_bytes: 1_000_000_000,
    languages: ["en"],
    license_note: "MIT",
    hf_repo: "test/repo",
    chat_template: "llama3_instruct",
  };
}

describe("sortCatalogByRecommendation", () => {
  it("orders known catalog ids with best-first ranking", () => {
    const sorted = sortCatalogByRecommendation([
      entry("mistral-7b-instruct-v03-q4km", "Mistral"),
      entry("qwen2.5-14b-instruct-q4km", "Qwen 14B"),
      entry("gemma-2-9b-it-q4km", "Gemma"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([
      "qwen2.5-14b-instruct-q4km",
      "gemma-2-9b-it-q4km",
      "mistral-7b-instruct-v03-q4km",
    ]);
  });

  it("sorts unknown ids by display_name after known ids", () => {
    const sorted = sortCatalogByRecommendation([
      entry("future-model-x", "Zebra"),
      entry("qwen2.5-14b-instruct-q4km", "Qwen"),
      entry("future-model-a", "Alpha"),
    ]);
    expect(sorted[0]?.id).toBe("qwen2.5-14b-instruct-q4km");
    expect(sorted.slice(1).map((e) => e.id)).toEqual([
      "future-model-a",
      "future-model-x",
    ]);
  });

  it("orders catalog ids by the shipped recommendation list (not alphabetically)", () => {
    const sorted = sortCatalogByRecommendation([
      entry("mistral-7b-instruct-v03-q4km", "Mistral"),
      entry("qwen2.5-7b-instruct-q4km", "Qwen 7B"),
      entry("qwen2.5-14b-instruct-q4km", "Qwen 14B"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([
      "qwen2.5-14b-instruct-q4km",
      "qwen2.5-7b-instruct-q4km",
      "mistral-7b-instruct-v03-q4km",
    ]);
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
