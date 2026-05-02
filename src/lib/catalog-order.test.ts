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
      entry("tinyllama-1.1b-chat-q4km", "Tiny"),
      entry("qwen2.5-14b-instruct-q4km", "Qwen 14B"),
      entry("mistral-7b-instruct-v03-q4km", "Mistral"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([
      "qwen2.5-14b-instruct-q4km",
      "mistral-7b-instruct-v03-q4km",
      "tinyllama-1.1b-chat-q4km",
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
      entry("tinyllama-1.1b-chat-q4km", "Tiny"),
      entry("moonlight-16b-a3b-instruct-q4ks", "Moon"),
      entry("qwen2.5-14b-instruct-q4km", "Qwen"),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([
      "qwen2.5-14b-instruct-q4km",
      "moonlight-16b-a3b-instruct-q4ks",
      "tinyllama-1.1b-chat-q4km",
    ]);
  });
});

describe("formatApproxDownloadGb", () => {
  it("uses two decimals below 10 GB", () => {
    expect(formatApproxDownloadGb(1_800_000_000)).toBe("~1.80 GB");
  });

  it("uses one decimal from 10 GB upward", () => {
    expect(formatApproxDownloadGb(10_500_000_000)).toBe("~10.5 GB");
  });

  it("formats zero and small sizes", () => {
    expect(formatApproxDownloadGb(0)).toBe("~0.00 GB");
    expect(formatApproxDownloadGb(500_000_000)).toBe("~0.50 GB");
  });
});
