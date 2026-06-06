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
const releaseLlamaBuildGlob = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src-tauri/target/release/build",
);

function parseDeploymentTarget(line) {
  const m = line.match(/^CMAKE_OSX_DEPLOYMENT_TARGET:STRING=(.+)$/);
  return m?.[1]?.trim() ?? null;
}

function isStale(deploy) {
  if (process.platform !== "darwin") return false;
  if (!deploy) return true;
  return deploy !== MIN_DEPLOY;
}

async function purgeReleaseLlamaBuildArtifacts() {
  if (process.platform !== "darwin") return;
  let entries;
  try {
    entries = await readdir(releaseLlamaBuildGlob, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("llama-cpp-sys-")) {
      const dir = path.join(releaseLlamaBuildGlob, entry.name);
      console.warn(
        `Removing release llama-cpp-sys build dir (${dir}) after stale cmake cache`,
      );
      await rm(dir, { recursive: true, force: true });
    }
  }
}

try {
  await stat(root);
} catch {
  process.exit(0);
}

let removedAny = false;

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
    if (process.platform === "darwin") {
      deploy = null;
    } else {
      continue;
    }
  }
  if (isStale(deploy)) {
    const dir = path.join(root, entry.name);
    console.warn(
      `Removing stale llama-cpp cmake cache (${dir}, CMAKE_OSX_DEPLOYMENT_TARGET=${deploy ?? "unset"}; need ${MIN_DEPLOY})`,
    );
    await rm(dir, { recursive: true, force: true });
    removedAny = true;
  }
}

if (removedAny) {
  await purgeReleaseLlamaBuildArtifacts();
}
