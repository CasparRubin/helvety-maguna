#!/usr/bin/env node
/**
 * llama-cpp-sys-4 reuses src-tauri/target/llama-cmake-cache across profiles.
 * A cache created before macOS 10.15 pins (e.g. 10.13) breaks release builds
 * because ggml uses C++17 std::filesystem. Remove stale entries so cmake
 * reconfigures with CMAKE_OSX_DEPLOYMENT_TARGET from .cargo/config.toml.
 */
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
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

function parseCxxFlags(line) {
  const m = line.match(/^CMAKE_CXX_FLAGS:STRING=(.+)$/);
  return m?.[1]?.trim() ?? null;
}

function isStale(deploy, cxxFlags) {
  if (process.platform !== "darwin") return false;
  if (!deploy || deploy !== MIN_DEPLOY) return true;
  // rustc/cmake can pin 10.13 in CXX flags while DEPLOYMENT_TARGET says 10.15 — breaks std::filesystem.
  if (cxxFlags?.includes("mmacosx-version-min=10.13")) return true;
  return false;
}

const TUNING_STUB = `# Maguna stub: llama-cpp-sys-4 0.7.0's published llama.cpp tree omits tools/tuning,
# but tools/CMakeLists.txt adds it when GGML_METAL is ON.
# Maguna does not build the Metal kernel tuner.
`;

/** Metal configure fails when tools/CMakeLists.txt lists tuning and the directory is absent. */
async function stubTuningUnderTools(tools) {
  const cmake = path.join(tools, "CMakeLists.txt");
  const tuning = path.join(tools, "tuning");
  let text;
  try {
    text = await readFile(cmake, "utf8");
  } catch {
    return false;
  }
  if (!text.includes("add_subdirectory(tuning)")) return false;
  try {
    await stat(tuning);
    return false;
  } catch {
    // Directory is absent; write the stub below.
  }
  await mkdir(tuning, { recursive: true });
  await writeFile(path.join(tuning, "CMakeLists.txt"), TUNING_STUB);
  console.warn(`Added tools/tuning stub under ${tools}`);
  return true;
}

/**
 * The sys crate copies llama.cpp once and then skips recopies when its version
 * sentinel matches, so a stub has to land in both the registry tree and any
 * already-copied OUT_DIR tree.
 */
async function stubMissingMetalTuningDir() {
  const cargoHome = process.env.CARGO_HOME ?? path.join(homedir(), ".cargo");
  const srcRoot = path.join(cargoHome, "registry", "src");
  let indexes;
  try {
    indexes = await readdir(srcRoot, { withFileTypes: true });
  } catch {
    indexes = [];
  }
  for (const index of indexes) {
    if (!index.isDirectory()) continue;
    const indexDir = path.join(srcRoot, index.name);
    let crates;
    try {
      crates = await readdir(indexDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const crate of crates) {
      if (!crate.isDirectory() || !crate.name.startsWith("llama-cpp-sys-4-")) {
        continue;
      }
      await stubTuningUnderTools(path.join(indexDir, crate.name, "llama.cpp", "tools"));
    }
  }

  const targetRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src-tauri/target",
  );
  let profiles;
  try {
    profiles = await readdir(targetRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const profile of profiles) {
    if (!profile.isDirectory()) continue;
    const buildDir = path.join(targetRoot, profile.name, "build");
    let builds;
    try {
      builds = await readdir(buildDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const build of builds) {
      if (!build.isDirectory() || !build.name.startsWith("llama-cpp-sys-4-")) {
        continue;
      }
      await stubTuningUnderTools(
        path.join(buildDir, build.name, "out", "llama.cpp", "tools"),
      );
    }
  }
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

await stubMissingMetalTuningDir();

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
  let cxxFlags;
  try {
    const text = await readFile(cacheFile, "utf8");
    for (const line of text.split("\n")) {
      const parsedDeploy = parseDeploymentTarget(line);
      if (parsedDeploy) deploy = parsedDeploy;
      const parsedCxx = parseCxxFlags(line);
      if (parsedCxx) cxxFlags = parsedCxx;
    }
  } catch {
    if (process.platform === "darwin") {
      deploy = null;
    } else {
      continue;
    }
  }
  if (isStale(deploy, cxxFlags)) {
    const dir = path.join(root, entry.name);
    const reason = cxxFlags?.includes("mmacosx-version-min=10.13")
      ? "CMAKE_CXX_FLAGS contains mmacosx-version-min=10.13"
      : `CMAKE_OSX_DEPLOYMENT_TARGET=${deploy ?? "unset"}; need ${MIN_DEPLOY}`;
    console.warn(`Removing stale llama-cpp cmake cache (${dir}, ${reason})`);
    await rm(dir, { recursive: true, force: true });
    removedAny = true;
  }
}

if (removedAny) {
  await purgeReleaseLlamaBuildArtifacts();
}
