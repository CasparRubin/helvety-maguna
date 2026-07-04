import type { CatalogEntry } from "@/lib/types";

import raw from "../../src-tauri/resources/catalog.json";

/** Embedded catalog JSON (same file Rust loads). Keep tests in sync via `catalog-expectations.ts` and `catalog.rs`. */
export type ShippedCatalogFile = {
  version: number;
  models: CatalogEntry[];
};

export const SHIPPED_CATALOG = raw as ShippedCatalogFile;
