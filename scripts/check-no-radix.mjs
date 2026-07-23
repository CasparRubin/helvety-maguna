#!/usr/bin/env node
/** Local guard: Maguna UI is shadcn base-nova on @base-ui/react only — no Radix packages or legacy shadcn presets in scanned files. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const FORBIDDEN = [
  /@radix-ui/i,
  /from\s+["']radix-ui["']/,
  /react-remove-scroll/i,
  /--radix-/,
  /\basChild\b/,
  /new-york/i,
];

const SCAN_FILES = [
  "package.json",
  "components.json",
  "bun.lock",
  "README.md",
  "index.html",
];

const SCAN_DIRS = ["src"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "node_modules" || name === "target") continue;
      walk(path, out);
      continue;
    }
    if (/\.(tsx?|jsx?|json|css|md|mdc|yml|yaml)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const files = [
  ...SCAN_FILES.map((f) => join(ROOT, f)),
  ...SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))),
];

const hits = [];

for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const rel = file.slice(ROOT.length + 1);
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) {
      hits.push({ file: rel, pattern: pattern.source });
    }
  }
}

if (hits.length > 0) {
  console.error("Radix remnants found:\n");
  for (const { file, pattern } of hits) {
    console.error(`  ${file} (matched /${pattern}/)`);
  }
  process.exit(1);
}

console.log("No Radix remnants found.");
