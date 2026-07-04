import { describe, expect, it } from "vitest";

import {
  EXPECTED_V7_CATALOG_MODELS,
  EXPECTED_V7_SIZE_ORDER,
  LEGACY_V4_CATALOG_IDS,
  LEGACY_V5_CATALOG_IDS,
} from "@/lib/catalog-expectations";
import { SHIPPED_CATALOG } from "@/lib/shipped-catalog";

describe("SHIPPED_CATALOG", () => {
  it("is catalog schema version 7 with ten models", () => {
    expect(SHIPPED_CATALOG.version).toBe(7);
    expect(SHIPPED_CATALOG.models).toHaveLength(10);
  });

  it("lists every v7 catalog id with the expected chat template and size", () => {
    const byId = new Map(SHIPPED_CATALOG.models.map((m) => [m.id, m]));
    for (const expected of EXPECTED_V7_CATALOG_MODELS) {
      const model = byId.get(expected.id);
      expect(model, `missing catalog model ${expected.id}`).toBeDefined();
      expect(model!.chat_template).toBe(expected.chat_template);
      expect(model!.size_bytes).toBe(expected.size_bytes);
    }
    expect([...byId.keys()].sort()).toEqual(
      EXPECTED_V7_CATALOG_MODELS.map((m) => m.id).sort(),
    );
  });

  it("matches Rust size-order expectations when sorted by download size", () => {
    const sorted = [...SHIPPED_CATALOG.models].sort(
      (a, b) => a.size_bytes - b.size_bytes,
    );
    expect(sorted.map((m) => m.id)).toEqual([...EXPECTED_V7_SIZE_ORDER]);
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

  it("lists EN/DE on GLM catalog entries for multilingual modes", () => {
    for (const id of ["glm-4-9b-0414-q4km", "glm-4.7-flash-q4km"] as const) {
      const model = SHIPPED_CATALOG.models.find((m) => m.id === id);
      expect(model).toBeDefined();
      expect(model!.languages).toContain("en");
      expect(model!.languages).toContain("de");
    }
  });
});
