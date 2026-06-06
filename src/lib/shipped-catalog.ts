import type { CatalogEntry } from "@/lib/types";

import raw from "../../src-tauri/resources/catalog.json";

/** Embedded catalog JSON (same file Rust loads). Keep `shipped-catalog.test.ts` in sync with `catalog.rs` v6 tests. */
export type ShippedCatalogFile = {
  version: number;
  models: CatalogEntry[];
};

export const SHIPPED_CATALOG = raw as ShippedCatalogFile;
