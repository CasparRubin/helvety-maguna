# Maguna

Desktop app for **GGUF models** you keep on disk: browse the catalog, download or import weights, set a **default**, then pick a mode and an installed GGUF **per mode**. The built-in modes are **Chat** (multi-turn assistant, replies follow the language of your latest message with English fallback), **Correction DE**, **Correction EN**, **Translate DE → EN**, and **Translate EN → DE**, plus any **custom** modes you add. The network is used only to **download weights** (for example from Hugging Face), not to run inference in the cloud.

On first launch the app opens **Chat**; other routes redirect **`/`**, **`/modes`**, and **`/spelling`** to **`/mode/chat`**; **`/translate`** still goes to the DE → EN mode.

## Stack

| Layer            | Tech                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell            | [Tauri 2](https://v2.tauri.app/) + Rust                                                                                                        |
| UI               | React 19, TypeScript, Vite, Tailwind, [shadcn/ui](https://ui.shadcn.com/) (New York)                                                           |
| On-device engine | [llama.cpp](https://github.com/ggerganov/llama.cpp) via [`llama_cpp`](https://crates.io/crates/llama_cpp) (enabled by default in `Cargo.toml`) |

## Requirements

- [Bun](https://bun.sh/) **1.2+** per `package.json` `engines`; CI and `packageManager` both pin **1.3.13** for reproducible installs
- **Node.js 24+** — declared in `package.json` `engines` for tooling compatibility (many editors and plugins expect Node); day-to-day commands use Bun
- [Rust](https://rustup.rs/) **stable** + **Xcode Command Line Tools** (macOS) or a normal C++ toolchain for Tauri
- **LLVM with libclang** on the machine that **compiles** the Rust crate (bindgen for `llama_cpp_sys`). macOS usually has this with Xcode CLT; Windows often needs a separate [LLVM](https://github.com/llvm/llvm-project/releases) install—use `bun run dev:windows` after installing LLVM, or set `LIBCLANG_PATH` yourself

## Quick start

```bash
bun install
bun run dev
```

That starts the full app: **Model library** (catalog, download, import, default model) and **Modes** (per-mode model, prompts, local inference).

### Using the app

- **Model library:** install models from the catalog or import a GGUF; set the **default** used by modes that do not override it.
- **Modes (configuration):** every mode lets you edit **Name**, **System prompt**, **Model**, Save / Reset / Duplicate (built-ins cannot be deleted). **Correction** and **Translate** modes also show **Language in** and **Language out** (German and English today). **Chat** does **not**: reply language follows each user message automatically (fallback English when unclear). Inference always uses weights on device only—not a hosted API inside the app.
- **Correction / Translate pages:** compact **Input** and **Output** areas with **copy** controls; **Enter** runs (**Shift+Enter** adds a newline). Each successful finished run appears in **Archive** on that mode’s page.
- **Chat page:** a **conversation** transcript, **composer** (**Enter** sends, **Shift+Enter** newline), **Send / Cancel**, and **New chat**. Completed replies update the current thread and are saved under **Archive** as **sessions** (full message history); open a row to continue, delete one chat, or **Clear archive**. Chat storage is separate per mode id (`localStorage` keys `maguna.chatSessions.v1:<modeId>` for Chat; correction/translate archives use `maguna.modeRunArchive.v1:<modeId>`).
- **Appearance:** sidebar **Light** / **Dark**; unsaved installs follow the OS. Choice is persisted (same key as [`index.html`](index.html)—see [`THEME_STORAGE_KEY`](src/context/theme-context.tsx) in [`src/context/theme-context.tsx`](src/context/theme-context.tsx)).

### Where models are stored

Weights live under a single **`Models`** directory (each catalog/import gets its own subfolder with `<model_id>.gguf` and `manifest.json`; older installs may still use `model.gguf`). Maguna picks that directory like this:

- **Windows** — normally **`Models` next to `maguna.exe`** (for example `C:\Program Files\Maguna\Models`). When you **develop** from this repo, the binary is usually `src-tauri\target\debug\maguna.exe`, so installs often land under **`…\target\debug\Models`**.  
  If beside-exe storage is unavailable or installs already live only under app data, Maguna uses **`%APPDATA%\com.helvety.maguna\maguna\models`** (Tauri’s `app_data_dir` is Roaming **`AppData`, not `Local`**).
- **macOS** — normally **`Maguna.app/Models`** next to `Contents` inside the `.app` bundle (for example `/Applications/Maguna.app/Models`). Otherwise **`~/Library/Application Support/com.helvety.maguna/maguna/models`**.
- **Linux** — same beside-exe rule as Windows when **`Models` next to the binary** is writable; otherwise weights under **`~/.local/share/com.helvety.maguna/maguna/models`** (or **`$XDG_DATA_HOME/com.helvety.maguna/maguna/models`** when `XDG_DATA_HOME` is set), following the XDG-style layout Tauri uses.

While catalog models **download**, the in-progress file is **`maguna/tmp/<model_id>.partial`** under Tauri’s per-user app data (for example **`%APPDATA%\com.helvety.maguna\maguna\tmp\`** on Windows, **`~/Library/Application Support/com.helvety.maguna/maguna/tmp/`** on macOS, typically **`~/.local/share/com.helvety.maguna/maguna/tmp/`** on Linux). After the stream (and a SHA256 check when the catalog lists one), Maguna **`rename`s** that file into **`Models`** when it is on the same volume, or **`copy`s** then **deletes** the partial when `Models` is on another drive. That step can take a long time across volumes; the UI shows **Finishing install**. Failed downloads, checksum mismatches, and failed installs **remove the partial when the OS allows it** so temp space is reclaimed; a rare error after a cross-volume copy may ask you to delete a leftover path manually.

In **Model library → Installed models**, use **Open models folder** for the **active** weights directory your file manager should open (**not** necessarily the `tmp` folder above).

### Scripts

| Command                 | Purpose                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`           | Full desktop app (default Rust features include the on-device engine)                                                                                             |
| `bun run dev:windows`   | Windows: runs `scripts/dev-windows.ps1` (finds LLVM, sets `LIBCLANG_PATH` / `NM_PATH`, then `tauri dev`)                                                          |
| `bun run dev:shell`     | Same UI, Rust **`--no-default-features`**: catalog, download, and import still work; **Run / Send inference fails** until a full (`llama`) build runs that binary |
| `bun run dev:vite`      | Vite dev server only (no Tauri; `invoke` / `listen` are not available)                                                                                            |
| `bun run build`         | Production frontend only (`tsc` + Vite → `dist/`; Tauri `beforeBuildCommand` uses this)                                                                           |
| `bun run test`          | Vitest (unit + component tests; component tests opt into `jsdom` per file)                                                                                        |
| `bun run lint`          | ESLint on the TypeScript/React tree                                                                                                                               |
| `bun run tauri build`   | Full desktop installer/bundle (frontend build + Rust with default features)                                                                                       |
| `bun run build:windows` | Windows: runs `scripts/build-windows.ps1` then `tauri build` (same LLVM setup as `dev:windows`)                                                                   |
| `bun run check`         | Format, lint, Vitest, frontend `build`, then Rust clippy + tests with **`--no-default-features`** (matches CI; fast compile without libclang)                     |

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
