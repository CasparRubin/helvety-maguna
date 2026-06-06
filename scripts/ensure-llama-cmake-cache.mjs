#!/usr/bin/env node
/**
 * llama-cpp-sys-4 reuses src-tauri/target/llama-cmake-cache across profiles.
 * A cache created before macOS 10.15 pins (e.g. 10.13) breaks release builds
 * because ggml uses C++17 std::filesystem. Remove stale entries so cmake
 * reconfigures with CMAKE_OSX_DEPLOYMENT_TARGET from .cargo/config.toml.
 */
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIN_DEPLOY = "10.15";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src-tauri/target/llama-cmake-cache",
);

function parseDeploymentTarget(line) {
  const m = line.match(/^CMAKE_OSX_DEPLOYMENT_TARGET:STRING=(.+)$/);
  return m?.[1]?.trim() ?? null;
}

function isStale(deploy) {
  if (!deploy) return false;
  const [maj, min = "0"] = deploy.split(".");
  const [wantMaj, wantMin = "0"] = MIN_DEPLOY.split(".");
  const major = Number(maj);
  const minor = Number(min);
  const wantMajor = Number(wantMaj);
  const wantMinor = Number(wantMin);
  if (Number.isNaN(major) || Number.isNaN(minor)) return false;
  return major < wantMajor || (major === wantMajor && minor < wantMinor);
}

try {
  await stat(root);
} catch {
  process.exit(0);
}

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const cacheFile = path.join(root, entry.name, "build", "CMakeCache.txt");
  let deploy;
  try {
    const text = await readFile(cacheFile, "utf8");
    for (const line of text.split("\n")) {
      const parsed = parseDeploymentTarget(line);
      if (parsed) {
        deploy = parsed;
        break;
      }
    }
  } catch {
    continue;
  }
  if (isStale(deploy)) {
    const dir = path.join(root, entry.name);
    console.warn(
      `Removing stale llama-cpp cmake cache (${dir}, CMAKE_OSX_DEPLOYMENT_TARGET=${deploy}; need >= ${MIN_DEPLOY})`,
    );
    await rm(dir, { recursive: true, force: true });
  }
}
