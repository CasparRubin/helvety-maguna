import type { CatalogEntry } from "@/lib/types";

import raw from "../../src-tauri/resources/catalog.json";

/** Embedded catalog JSON (same file Rust loads). Used by tests to stay in sync with shipped models. */
export type ShippedCatalogFile = {
  version: number;
  models: CatalogEntry[];
};

export const SHIPPED_CATALOG = raw as ShippedCatalogFile;
