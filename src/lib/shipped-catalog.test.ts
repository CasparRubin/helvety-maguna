import { describe, expect, it } from "vitest";

import {
  EXPECTED_V9_CATALOG_MODELS,
  EXPECTED_V9_SIZE_ORDER,
  LEGACY_V4_CATALOG_IDS,
  LEGACY_V5_CATALOG_IDS,
  LEGACY_V7_CATALOG_IDS,
  LEGACY_V8_CATALOG_IDS,
} from "@/lib/catalog-expectations";
import { RECOMMENDED_CATALOG_MODEL_ID } from "@/lib/catalog-order";
import { SHIPPED_CATALOG } from "@/lib/shipped-catalog";

describe("SHIPPED_CATALOG", () => {
  it("is catalog schema version 9 with thirteen models", () => {
    expect(SHIPPED_CATALOG.version).toBe(9);
    expect(SHIPPED_CATALOG.models).toHaveLength(13);
  });

  it("lists every v9 catalog id with the expected chat template and size", () => {
    const byId = new Map(SHIPPED_CATALOG.models.map((m) => [m.id, m]));
    for (const expected of EXPECTED_V9_CATALOG_MODELS) {
      const model = byId.get(expected.id);
      expect(model, `missing catalog model ${expected.id}`).toBeDefined();
      expect(model!.chat_template).toBe(expected.chat_template);
      expect(model!.size_bytes).toBe(expected.size_bytes);
    }
    expect([...byId.keys()].sort()).toEqual(
      EXPECTED_V9_CATALOG_MODELS.map((m) => m.id).sort(),
    );
  });

  it("matches Rust size-order expectations when sorted by download size", () => {
    const sorted = [...SHIPPED_CATALOG.models].sort(
      (a, b) => a.size_bytes - b.size_bytes,
    );
    expect(sorted.map((m) => m.id)).toEqual([...EXPECTED_V9_SIZE_ORDER]);
  });

  it("includes required metadata on every catalog entry", () => {
    for (const model of SHIPPED_CATALOG.models) {
      expect(model.maker.trim().length, model.id).toBeGreaterThan(0);
      expect(model.display_name.trim().length, model.id).toBeGreaterThan(0);
      expect(model.description.trim().length, model.id).toBeGreaterThan(0);
      expect(model.url, model.id).toMatch(/^https:\/\//);
      expect(model.hf_repo.trim().length, model.id).toBeGreaterThan(0);
      expect(model.languages.length, model.id).toBeGreaterThan(0);
      expect(model.license_note.trim().length, model.id).toBeGreaterThan(0);
      expect(model.chat_template?.trim().length, model.id).toBeGreaterThan(0);
      expect(model.sha256, model.id).toMatch(/^[a-f0-9]{64}$/i);
      if (model.release_date != null) {
        expect(model.release_date, model.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("does not list retired v4 catalog ids", () => {
    const ids = SHIPPED_CATALOG.models.map((m) => m.id);
    for (const legacy of LEGACY_V4_CATALOG_IDS) {
      expect(ids).not.toContain(legacy);
    }
  });

  it("does not list retired v5 catalog ids", () => {
    const ids = SHIPPED_CATALOG.models.map((m) => m.id);
    for (const legacy of LEGACY_V5_CATALOG_IDS) {
      expect(ids).not.toContain(legacy);
    }
  });

  it("does not list retired v7 catalog ids", () => {
    const ids = SHIPPED_CATALOG.models.map((m) => m.id);
    for (const legacy of LEGACY_V7_CATALOG_IDS) {
      expect(ids).not.toContain(legacy);
    }
  });

  it("does not list retired v8 catalog ids", () => {
    const ids = SHIPPED_CATALOG.models.map((m) => m.id);
    for (const legacy of LEGACY_V8_CATALOG_IDS) {
      expect(ids).not.toContain(legacy);
    }
  });

  it("lists EN/DE on GLM catalog entries for multilingual modes", () => {
    for (const id of ["glm-4-9b-0414-q4km", "glm-4.7-flash-q4km"] as const) {
      const model = SHIPPED_CATALOG.models.find((m) => m.id === id);
      expect(model).toBeDefined();
      expect(model!.languages).toContain("en");
      expect(model!.languages).toContain("de");
    }
  });

  it("ships mmproj and MTP sidecars for Gemma 4 12B", () => {
    const gemma = SHIPPED_CATALOG.models.find((m) => m.id === "gemma-4-12b-it-q4km");
    expect(gemma?.mmproj_url).toMatch(/mmproj/);
    expect(gemma?.mmproj_size_bytes).toBe(175_115_840);
    expect(gemma?.mmproj_sha256).toMatch(/^[a-f0-9]{64}$/i);
    expect(gemma?.mtp_draft_url).toMatch(/mtp/);
    expect(gemma?.mtp_draft_size_bytes).toBe(465_109_248);
    expect(gemma?.mtp_draft_sha256).toMatch(/^[a-f0-9]{64}$/i);
  });

  it("uses current v9 display names for R1-0528 and HY-MT1.5 replacements", () => {
    expect(
      SHIPPED_CATALOG.models.find((m) => m.id === "deepseek-r1-0528-qwen3-8b-q4km")
        ?.display_name,
    ).toBe("DeepSeek R1-0528 Qwen3 8B");
    expect(
      SHIPPED_CATALOG.models.find((m) => m.id === "hy-mt15-7b-q4km")?.display_name,
    ).toBe("HY-MT1.5 7B");
  });

  it("marks only Gemma 4 12B as the recommended starting model in catalog copy", () => {
    const recommended = SHIPPED_CATALOG.models.filter((m) =>
      m.description.startsWith("Recommended starting model:"),
    );
    expect(recommended).toHaveLength(1);
    expect(recommended[0]?.id).toBe(RECOMMENDED_CATALOG_MODEL_ID);
    expect(recommended[0]?.display_name).toBe("Gemma 4 12B");
    expect(recommended[0]?.description).toMatch(/vision projector/i);
    expect(recommended[0]?.description).not.toMatch(/faster decode when enabled/i);

    const ministral8b = SHIPPED_CATALOG.models.find(
      (m) => m.id === "ministral-3-8b-instruct-q4km",
    );
    expect(ministral8b?.description.startsWith("Recommended starting model:")).toBe(
      false,
    );
  });
});
