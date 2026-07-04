#!/usr/bin/env node
/**
 * Fail CI/local builds if the macOS app binary still depends on unpackaged dylibs
 * (@rpath ggml/llama or Homebrew libomp). Those break drag-to-Applications installs.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appBinary = path.join(
  root,
  "src-tauri/target/release/bundle/macos/Helvety Maguna.app/Contents/MacOS/maguna",
);

if (!fs.existsSync(appBinary)) {
  console.error(`verify-macos-bundle: binary not found at ${appBinary}`);
  console.error("Run `bun run build:app` first.");
  process.exit(1);
}

const otool = spawnSync("otool", ["-L", appBinary], { encoding: "utf8" });
if (otool.status !== 0) {
  console.error(otool.stderr || otool.stdout);
  process.exit(otool.status ?? 1);
}

const forbidden = [
  { pattern: /@rpath\//, reason: "unpackaged @rpath dylib (enable static llama-cpp-4)" },
  { pattern: /libggml/, reason: "dynamic ggml library" },
  { pattern: /libllama/, reason: "dynamic llama library" },
  { pattern: /\/opt\/homebrew\//, reason: "Homebrew runtime dependency" },
  { pattern: /\/usr\/local\/opt\//, reason: "Homebrew runtime dependency" },
];

const lines = otool.stdout.split("\n").slice(1).filter(Boolean);
const violations = [];
for (const line of lines) {
  const dep = line.trim().split(/\s+/)[0] ?? "";
  for (const { pattern, reason } of forbidden) {
    if (pattern.test(dep)) {
      violations.push({ dep, reason });
    }
  }
}

if (violations.length > 0) {
  console.error("verify-macos-bundle: forbidden dynamic dependencies:\n");
  for (const { dep, reason } of violations) {
    console.error(`  ${dep}  (${reason})`);
  }
  process.exit(1);
}

console.log("verify-macos-bundle: OK (system frameworks only)");
