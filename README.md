# Maguna

Desktop app for **GGUF models** you keep on disk: browse the catalog, download or import weights, set a default, then use each **mode** (built-in **Correction DE**, **Correction EN**, **Translate DE -> EN**, **Translate EN -> DE**, plus custom modes) with the installed model you pick. The app uses the network only to **download files** (for example from Hugging Face), not to run models in the cloud.

## Stack

| Layer            | Tech                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell            | [Tauri 2](https://v2.tauri.app/) + Rust                                                                                                        |
| UI               | React 19, TypeScript, Vite, Tailwind, [shadcn/ui](https://ui.shadcn.com/) (New York)                                                           |
| On-device engine | [llama.cpp](https://github.com/ggerganov/llama.cpp) via [`llama_cpp`](https://crates.io/crates/llama_cpp) (enabled by default in `Cargo.toml`) |

## Requirements

- [Bun](https://bun.sh/) **1.2+** (the repo pins a version in `packageManager`; CI uses that pin)
- **Node.js 24+** — declared in `package.json` `engines` for tooling compatibility (many editors and plugins expect Node); day-to-day commands use Bun
- [Rust](https://rustup.rs/) **stable** + **Xcode Command Line Tools** (macOS) or a normal C++ toolchain for Tauri
- **LLVM with libclang** on the machine that **compiles** the Rust crate (bindgen for `llama_cpp_sys`). macOS usually has this with Xcode CLT; Windows often needs a separate [LLVM](https://github.com/llvm/llvm-project/releases) install—use `bun run dev:windows` after installing LLVM, or set `LIBCLANG_PATH` yourself

## Quick start

```bash
bun install
bun run dev
```

That starts the full app: **Model library** (catalog, download, import, default model) and **modes** (per-mode model choice, prompts, and **Run** against installed weights).

### Using the app

- **Model library:** install models from the catalog or import a GGUF; set the **default** for modes that do not override it.
- **Each mode:** optional per-mode model; edit prompts; **Run** uses your installed weights only.
- **Appearance:** the sidebar has **Light** and **Dark**; if no saved preference exists, Maguna initializes from your system theme. Your explicit choice is persisted (same `localStorage` API as in the Tauri webview).

### Where models are stored

Weights live under a single **`Models`** directory (each catalog/import gets its own subfolder with `<model_id>.gguf` and `manifest.json`; older installs may still use `model.gguf`). Maguna picks that directory like this:

- **Windows** — normally **`Models` next to `maguna.exe`** (for example `C:\Program Files\Maguna\Models`). When you **develop** from this repo, the binary is usually `src-tauri\target\debug\maguna.exe`, so installs often land under **`…\target\debug\Models`**.  
  If beside-exe storage is unavailable or installs already live only under app data, Maguna uses **`%APPDATA%\com.helvety.maguna\maguna\models`** (Tauri’s `app_data_dir` is Roaming **`AppData`, not `Local`**).
- **macOS** — normally **`Maguna.app/Models`** next to `Contents` inside the `.app` bundle (for example `/Applications/Maguna.app/Models`). Otherwise **`~/Library/Application Support/com.helvety.maguna/maguna/models`**.

While catalog models **download**, the partial file is written under **`%APPDATA%\com.helvety.maguna\maguna\tmp\`** on Windows (**`~/Library/Application Support/.../maguna/tmp/`** on macOS); after the HTTP stream completes, Maguna moves or copies into **`Models`** (which can take a long time across drives—the UI keeps a separate **Finishing install** step).

In **Model library → Installed models**, use **Open models folder** for the **active** weights directory File Explorer / Finder should open (**not** necessarily the tmp folder above).

### Scripts

| Command                 | Purpose                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`           | Full desktop app (default Rust features include the on-device engine)                                                                         |
| `bun run dev:windows`   | Windows: runs `scripts/dev-windows.ps1` (finds LLVM, sets `LIBCLANG_PATH` / `NM_PATH`, then `tauri dev`)                                      |
| `bun run dev:shell`     | Same UI, Rust built with `--no-default-features` (catalog/download/import work; **Run** in a mode fails until you use a full engine build)    |
| `bun run dev:vite`      | Vite dev server only (no Tauri; `invoke` / `listen` are not available)                                                                        |
| `bun run build`         | Production frontend only (`tsc` + Vite → `dist/`; Tauri `beforeBuildCommand` uses this)                                                       |
| `bun run tauri build`   | Full desktop installer/bundle (frontend build + Rust with default features)                                                                   |
| `bun run build:windows` | Windows: runs `scripts/build-windows.ps1` then `tauri build` (same LLVM setup as `dev:windows`)                                               |
| `bun run check`         | Format, lint, Vitest, frontend `build`, then Rust clippy + tests with **`--no-default-features`** (matches CI; fast compile without libclang) |

### Contributors: engine-free Rust checks

`bun run check` runs **`cargo clippy` / `cargo test` with `--no-default-features`** so CI and laptops without libclang still get a strict Rust pass. That Rust configuration omits the GGUF engine, so it does not prove the `llama` stack links on your machine—for that, run **`bun run dev`** (or `cargo build` in `src-tauri` with default features) once LLVM is available.

### Inference speed (CPU vs GPU, local vs API)

Running a **7B** quantized model purely on **CPU** often means **tens of seconds to a minute or more** for prompt “prefill” on a laptop, plus time per token—it is normal compared to GPU servers.

- **This repo enables `llama_cpp`’s `metal` feature**, so **macOS** builds use **Apple’s Metal GPU** for the heavy linear-algebra work after you rebuild (`bun run dev` / `tauri build`). Prefill and decoding are usually _dramatically_ faster than the old CPU-only linkage on a recent Mac.
- **Windows / Linux** builds here are still **CPU-only** unless someone wires **Vulkan** or **CUDA** through `llama_cpp_sys` (different toolchains + drivers).
- **No cloud API is required.** For **fast** answers without tuning local GPU builds, vendors’ hosted APIs remain an option—it is a latency/cost/trade-secret trade-off, not a technical necessity.

Beyond hardware, smaller models (**1B–3B** GGUF), slightly coarser quantization, and shorter prompts/context all reduce wall-clock time offline.

## License

MIT — see [`LICENSE`](LICENSE).
