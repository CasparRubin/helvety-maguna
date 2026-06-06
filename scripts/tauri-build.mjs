#!/usr/bin/env node
/**
 * Run `tauri build` with macOS 10.15+ pins so llama-cpp-sys cmake matches `.cargo/config.toml`.
 * `tauri build` alone can leave CMAKE_OSX_DEPLOYMENT_TARGET at 10.13 in the shared cmake cache.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };

if (process.platform === "darwin") {
  env.MACOSX_DEPLOYMENT_TARGET = "10.15";
  env.CMAKE_OSX_DEPLOYMENT_TARGET = "10.15";
  if (!env.CXXFLAGS?.includes("mmacosx-version-min")) {
    env.CXXFLAGS = "-mmacosx-version-min=10.15";
  }
  if (!env.CFLAGS?.includes("mmacosx-version-min")) {
    env.CFLAGS = "-mmacosx-version-min=10.15";
  }
}

const result = spawnSync("bunx", ["tauri", "build"], {
  cwd: root,
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
