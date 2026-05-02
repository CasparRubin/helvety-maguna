# Maguna

Desktop app for **local GGUF models** — download weights, assign models per mode, and run **modes** (built-in Correction & Translate for EN/DE, plus your own prompts). Inference stays on your machine; the app only uses the network to **fetch model files** (e.g. Hugging Face), not to run cloud LLMs.

## Stack

| Layer                | Tech                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell                | [Tauri 2](https://v2.tauri.app/) + Rust                                                                                                      |
| UI                   | React 19, TypeScript, Vite, Tailwind, [shadcn/ui](https://ui.shadcn.com/) (New York)                                                         |
| Inference (optional) | [llama.cpp](https://github.com/ggerganov/llama.cpp) via [`llama_cpp`](https://crates.io/crates/llama_cpp) when built with `--features llama` |

## Requirements

- [Bun](https://bun.sh/) **1.2+** (see `packageManager` / `engines` in `package.json`)
- [Rust](https://rustup.rs/) **stable** + **Xcode CLT** (macOS) or equivalent C++ toolchain for Tauri
- **LLVM with libclang** — only if you build with the `llama` feature (on-device inference)

## Quick start

```bash
bun install
bun run dev
```

That runs **`tauri dev`** (Vite + desktop). Model catalog, install, and import work in the default build. **GGUF inference** needs a build that links llama.cpp (see below).

### Using the app

- **Sidebar:** **Model library** (downloads, imports, default GGUF) plus **one entry per mode** (Correction, Translate, and any modes you add). Open a mode to edit its prompts, assign which **installed** model that mode uses, and run inference.
- **Default model:** Set in Model library; any mode **without** its own assignment uses that default. Per-mode picks override the default for that mode only.

### Useful scripts

| Command                                 | Purpose                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`                           | Dev UI + Tauri; no llama.cpp (faster compile)                                                                           |
| `bun run dev:llama`                     | Dev **with** inference (`libclang` required; Windows: set `LIBCLANG_PATH` to LLVM `bin` or use `bun run dev:llama:win`) |
| `bun run dev:vite`                      | Vite only (no Tauri IPC)                                                                                                |
| `bun run build` / `bun run tauri build` | Production frontend + app bundle                                                                                        |
| `bun run build:llama`                   | Release build **with** llama feature                                                                                    |
| `bun run check`                         | Format, lint, tests, TS build, Rust clippy + tests (same idea as CI)                                                    |

### Building with local inference (`llama`)

`llama_cpp_sys` uses **bindgen** → you need **libclang** on the machine that compiles:

- **macOS:** `xcode-select --install` is usually enough, then `bun run dev:llama`.
- **Windows:** Install [LLVM](https://github.com/llvm/llvm-project/releases), then either `bun run dev:llama:win` or set `LIBCLANG_PATH` to the folder that contains `libclang.dll` (and ensure `llvm-nm` is on `PATH` / `NM_PATH` if the build asks for it), then `bun run dev:llama`.
- **Linux:** Install `clang` / `libclang-dev` (package names vary by distro), then `bun run dev:llama`.

From `src-tauri`: `cargo build --features llama --release`.

## License

MIT — see [`LICENSE`](LICENSE).
