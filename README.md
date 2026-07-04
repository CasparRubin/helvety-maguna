# Maguna

Desktop app for **GGUF models** you keep on disk: browse the catalog, download or import weights, set a **default**, then pick a mode and an installed GGUF **per mode**. The built-in modes are **Chat** (multi-turn conversation; the UI labels assistant replies **Maguna**, and answers follow the language of your latest message with English fallback), **Correction DE**, **Correction EN**, **Translate DE → EN**, and **Translate EN → DE**, plus any **custom** modes you add. Inference runs **on device** via llama.cpp; the network is used only to **download weights** (for example from Hugging Face)—there is **no hosted chat API inside the app**.

Maguna **always** prepends a **guardrails** paragraph to every mode’s system instructions (neutral tone and safety-themed guidance; **best-effort**—local models do not honor instructions reliably). You cannot turn guardrails off; you may replace the built-in wording with a **custom** paragraph under **Model library → Output guardrails**. The same built-in text, publisher info (`helvety.com`), acceptable-use summary, safe-use tips, and legal disclaimers are on **Settings** (`/settings`, read-only for policy text).

On first launch the app opens **Chat**; other routes redirect **`/`**, **`/modes`**, and **`/spelling`** to **`/mode/chat`**; **`/translate`** still goes to the DE → EN mode.

## Stack

| Layer            | Tech                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell            | [Tauri 2](https://v2.tauri.app/) + Rust                                                                                                           |
| UI               | React 19, TypeScript, Vite, Tailwind, [shadcn/ui](https://ui.shadcn.com/) (New York)                                                              |
| On-device engine | [llama.cpp](https://github.com/ggml-org/llama.cpp) via [`llama-cpp-4`](https://crates.io/crates/llama-cpp-4) (enabled by default in `Cargo.toml`) |

## Requirements

- [Bun](https://bun.sh/) **1.2+** per `package.json` `engines`; CI and `packageManager` both pin **1.3.14** for reproducible installs
- **Node.js 24+** — declared in `package.json` `engines` for tooling compatibility (many editors and plugins expect Node); day-to-day commands use Bun
- [Rust](https://rustup.rs/) **stable** + **Xcode Command Line Tools** (macOS) or a normal C++ toolchain for Tauri
- **LLVM with libclang** on the machine that **compiles** the Rust crate (bindgen for `llama-cpp-sys-4`). macOS usually has this with Xcode CLT; Windows often needs a separate [LLVM](https://github.com/llvm/llvm-project/releases) install—use `bun run dev:windows` after installing LLVM, or set `LIBCLANG_PATH` yourself
- **CMake** — required to compile `llama-cpp-4` from source on the first full build (`bun run dev`, `bun run build:app`). macOS: `brew install cmake`; Windows/Linux: install [CMake](https://cmake.org/download/) (and on Windows, LLVM as above)
- **macOS deployment target 10.15+** — `llama-cpp-4` uses C++17 `std::filesystem`; [`src-tauri/.cargo/config.toml`](src-tauri/.cargo/config.toml) pins `MACOSX_DEPLOYMENT_TARGET=10.15`. If a release build fails with “`path` is unavailable: introduced in macOS 10.15”, run `node scripts/ensure-llama-cmake-cache.mjs` (also runs automatically before `bun run dev` / `bun run build:app`) to drop a stale shared cmake cache under `src-tauri/target/llama-cmake-cache/` (including caches where `CMAKE_CXX_FLAGS` still contain `mmacosx-version-min=10.13`).

### Dependency policy

Direct dependencies are kept on **latest stable within the current major** (Bun **1.3.14**, Tauri **2.11**, React **19**, Vite **7**, etc.). Major bumps deferred until a dedicated migration: **ESLint 10**, **Tailwind 4**, **TypeScript 6**, **Vite 8** / **Vitest 4**.

## Quick start

```bash
bun install
bun run dev
```

That starts the full app: **Model library** (catalog, download, import, default model, guardrails custom policy), **Settings** (Helvety / Maguna basics, read-only guardrails reference, terms and disclaimers), and **Modes** (sidebar navigation plus per-mode workspaces; configure each mode from its page via **Edit configuration**).

### Using the app

- **Model library:** install models from the catalog or **import a GGUF** with **Choose file…** (native file picker); set the **default** used by modes that do not override it. Installed weights are stored in per-user app data (`maguna/models`) and **survive app updates** (see [Where models are stored](#where-models-are-stored)). The embedded catalog (currently **version 8**) lists thirteen **Q4_K_M** Hugging Face picks—**Gemma 4 12B** is highlighted as the recommended starting model; **Ministral 3 3B**, **Phi-4 mini**, **Qwen 3.5 4B**, **Hunyuan-MT 7B**, **Ministral 3 8B**, **Ministral 3 14B**, **Qwen 3.5 9B**, **GLM-4 9B**, **Gemma 4 26B A4B**, **Qwen 3.6 27B**, **GLM-4.7 Flash**, and **DeepSeek R1 Distill Qwen 7B** are also available. Maguna ships **metadata only** (no bundled weights). Retired catalog ids (Qwen 2.5, Gemma 2, Mistral 7B v0.3, Qwen 3 8B, Qwen 3 14B) no longer appear for new downloads; GGUFs you already installed keep working. Each catalog entry uses a **family-specific chat template** (Qwen non-thinking, Gemma 4 turn/channel, Phi-4, Hunyuan-MT, Ministral 3, GLM-4 role tokens, GLM-4.7 Flash `/nothink`, etc.); Maguna **strips reasoning and control tokens** from displayed output for polished copy—**DeepSeek R1 Distill** (catalog) and imported **GLM-Z1** GGUFs are the exceptions and may show a visible chain-of-thought trace. During a catalog download, that card’s **Download** button shows **Downloading…** (with **%** when the size is known), then **Finishing install…**; a progress summary also appears at the top of the page. **Output guardrails:** a global policy paragraph is **always** prepended ahead of each mode’s system prompt (built-in wording by default). You may paste a **custom** paragraph instead; both are persisted in app settings (see configuration files below). Edits to custom text happen here; **Settings** shows the active policy read-only.
- **Settings (`/settings`):** **[Helvety](https://helvety.com)** link; **read-only** **built-in** guardrail paragraph (used whenever no custom paragraph is set); active **custom** policies also appear **read-only** when in use; safe-use guidelines; Helvety-authored **acceptable use** summary and liability disclaimers—**informational only** (not individualized legal counsel).
- **Modes (configuration):** each mode page shows the mode **name**, **Edit configuration** (top right, opens a **dialog** titled **Mode configuration**), then the workspace (**conversation** + composer for Chat, or **Input** / **Output** otherwise). In the dialog: **Name**, **System prompt**, **Model**, **Save mode**, **Duplicate**, **Reset to default** (built-in modes only), and **Delete** (custom modes only; built-ins cannot be removed). **Correction** and **Translate** layouts also include **Language in** and **Language out** (German and English today). **Chat** omits those selectors: reply language follows each user message automatically (fallback English when unclear). Inference always uses weights on device only—not a hosted API inside the app.
- **Correction / Translate pages:** compact **Input** and **Output** areas with **copy** controls in the top-right of each live field; **Enter** runs (**Shift+Enter** adds a newline). Each successful finished run appears in **Archive** on that mode’s page (copy buttons sit beside each archived **Input** / **Output** label); delete individual rows or **Clear archive** (in-app confirmation dialog).
- **Chat page:** **conversation** transcript where assistant turns are labeled **Maguna** in the UI (roles in storage and when calling the backend remain `user` / `assistant`). While a reply is generating, the bubble shows a shimmering **Thinking...** placeholder until streamed text arrives; a **copy** control appears on assistant bubbles once there is text to copy. **Composer** (**Enter** sends, **Shift+Enter** newline), **Send**, **Cancel**, **Paste and run**, and **New chat**. Transcript height tracks the main pane (`#main-content`) so the **Message** area and actions usually stay visible above **Archive**—scroll the page when you need the archive list. Completed replies update the current thread and are saved under **Archive** as **sessions** (full message history); open a row to continue, delete one chat, or **Clear archive** (in-app confirmation dialog). Chat storage is separate per mode id (`localStorage` keys `maguna.chatSessions.v1:<modeId>` for Chat; correction/translate archives use `maguna.modeRunArchive.v1:<modeId>`).
- **Appearance:** sidebar **Light** / **Dark**; unsaved installs follow the OS. Choice is persisted (same key as [`index.html`](index.html)—see [`THEME_STORAGE_KEY`](src/context/theme-context.tsx) in [`src/context/theme-context.tsx`](src/context/theme-context.tsx)).

### Where models are stored

Installed weights always live under **`maguna/models`** in Tauri’s per-user app data (each catalog/import gets its own subfolder with `<model_id>.gguf` and `manifest.json`; older installs may still use `model.gguf`). Dev, release, and installed builds share this path, so you do not need to move models after every build.

- **Windows** — **`%APPDATA%\com.helvety.maguna\maguna\models`** (Tauri’s `app_data_dir` is Roaming **`AppData`, not `Local`**).
- **macOS** — **`~/Library/Application Support/com.helvety.maguna/maguna/models`**.
- **Linux** — **`~/.local/share/com.helvety.maguna/maguna/models`** (or **`$XDG_DATA_HOME/com.helvety.maguna/maguna/models`** when `XDG_DATA_HOME` is set).

On startup, Maguna **migrates** any models still sitting in older locations (for example **`Models` next to the binary**, **`src-tauri/target/debug/Models`**, or **`src-tauri/target/release/Models`**) into that canonical folder. Run the app once after upgrading if weights were only under a dev `target` tree.

While catalog models **download**, the in-progress file is **`maguna/tmp/<model_id>.partial`** under the same app data root (for example **`%APPDATA%\com.helvety.maguna\maguna\tmp\`** on Windows, **`~/Library/Application Support/com.helvety.maguna/maguna/tmp/`** on macOS, typically **`~/.local/share/com.helvety.maguna/maguna/tmp/`** on Linux). After the stream (and a SHA256 check when the catalog lists one), Maguna **`rename`s** that file into **`maguna/models`** when it is on the same volume, or **`copy`s** then **deletes** the partial when storage is on another drive. That install step can take a long time across volumes; the UI shows **Downloading…** (with **%** when known) on the catalog button, then **Finishing install…** on the button and in the progress card at the top of **Model library**. Failed downloads, checksum mismatches, and failed installs **remove the partial when the OS allows it** so temp space is reclaimed; a rare error after a cross-volume copy may ask you to delete a leftover path manually.

In **Model library → Installed models**, use **Open models folder** to open the canonical **`maguna/models`** directory (**not** the `tmp` folder above).

**App updates:** Replacing or upgrading the installed app does **not** remove downloaded models. Weights and settings live under the stable app identifier **`com.helvety.maguna`** in per-user app data, separate from the `.app` / `.exe` bundle. Models survive normal in-place updates. They are removed only if the user uninstalls and deletes app data, or manually deletes the `maguna/models` folder. Do not change the bundle identifier between releases without a migration plan—that would point Maguna at a new empty data directory.

### Configuration beside models

Under **`maguna/`** in the same Tauri app-data tree as **`tmp/`** (see paths above—for example **`…/maguna/modes.json`** on disk):

| File                | Contents                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`modes.json`**    | Mode list: ids, names, system prompts, layout, builtin flags                                                                                              |
| **`settings.json`** | Global default GGUF id, per-mode GGUF overrides, `guardrails_enabled` (legacy field; always treated as on at runtime), optional **custom guardrail** text |

Treat these as portable user data backups if you reinstall the shell.

### Scripts

| Command                    | Purpose                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`              | Full desktop app (default Rust features include the on-device engine)                                                                                             |
| `bun run dev:windows`      | Windows: runs `scripts/dev-windows.ps1` (finds LLVM, sets `LIBCLANG_PATH` / `NM_PATH`, then `tauri dev`)                                                          |
| `bun run dev:shell`        | Same UI, Rust **`--no-default-features`**: catalog, download, and import still work; **Run / Send inference fails** until a full (`llama`) build runs that binary |
| `bun run dev:vite`         | Vite dev server only (no Tauri; `invoke` / `listen` are not available)                                                                                            |
| `bun run build`            | Production frontend only (`tsc` + Vite → `dist/`; Tauri `beforeBuildCommand` uses this)                                                                           |
| `bun run test`             | Vitest (unit + component tests; component tests opt into `jsdom` per file)                                                                                        |
| `bun run lint`             | ESLint on the TypeScript/React tree                                                                                                                               |
| `bun run build:app`        | **Recommended** production bundle: purges stale llama-cpp cmake caches, pins macOS 10.15+ for release, then `tauri build`                                         |
| `bun run tauri build`      | Full desktop installer/bundle (on macOS prefer **`build:app`** so cmake uses 10.15+, not a stale 10.13 cache)                                                     |
| `bun run build:windows`    | Windows: runs `scripts/build-windows.ps1` then `tauri build` (same LLVM setup as `dev:windows`)                                                                   |
| `bun run check`            | Format, lint, Vitest, frontend `build`, then Rust clippy + tests with **`--no-default-features`** (matches CI; fast compile without libclang)                     |
| `bun run check:rust:llama` | Rust **chat-template** tests with the `llama` feature (family-specific prompt formatting); macOS CI runs this after `check`                                       |

### Contributors: engine-free Rust checks

`bun run check` runs **`cargo clippy` / `cargo test` with `--no-default-features`** so CI and laptops without libclang still get a strict Rust pass. That Rust configuration omits the GGUF engine, so it does not prove the `llama` stack links on your machine—for that, run **`bun run dev`** (or `cargo build` in `src-tauri` with default features) once LLVM is available. On macOS, CI also runs **`bun run check:rust:llama`** to verify instruct chat-template formatting.

To smoke-test a GGUF load + greedy decode outside the UI: `cargo run --example spike_load --features llama -- /path/to/model.gguf "prompt"`. Instruct families (Qwen, Gemma, GLM, Phi-4, Ministral 3, …) expect a **family-specific chat template** in the prompt string—see `src-tauri/src/chat_template.rs`; raw user text alone is only a rough smoke test.

### Inference speed (CPU vs GPU, local vs API)

Running a **multi‑billion‑parameter** quantized model on **CPU alone** often means **tens of seconds to a minute or more** for prompt “prefill” on a laptop, plus time per token—it is normal compared to GPU servers.

- **This repo enables `llama-cpp-4`'s `metal` feature**, so **macOS** builds use **Apple's Metal GPU** for the heavy linear-algebra work after you rebuild (`bun run dev` / `bun run build:app`). Prefill and decoding are usually _dramatically_ faster than CPU-only linkage on a recent Mac.
- **Windows / Linux** builds here are still **CPU-only** unless someone wires **Vulkan** or **CUDA** through `llama-cpp-4` feature flags (different toolchains + drivers).
- **No cloud API is required.** For **fast** answers without tuning local GPU builds, vendors’ hosted APIs remain an option—it is a latency/cost/trade-secret trade-off, not a technical necessity.

Beyond hardware, smaller quant sizes (for example **8B** instead of **14B**), slightly coarser quantization, and shorter prompts/context all reduce wall-clock time offline. Maguna disables thinking mode in Qwen and Gemma 4 prompts, uses `/nothink` on GLM-4.7 Flash user turns, and filters reasoning/control tokens from the UI for other catalog models (including GLM-4 9B); **DeepSeek R1 Distill** and imported **GLM-Z1** models intentionally keep visible chain-of-thought when you want step-by-step reasoning.

## GitHub releases (downloadable builds)

CI builds and tests on every push in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). **Installers** are produced by [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Bump **`version`** in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) if needed (it must match the tag, e.g. `0.1.0` → tag `v0.1.0`).
2. Commit and push to `main`.
3. Create and push a tag: `git tag v0.1.0 && git push origin v0.1.0`  
   Or open **Actions → Release → Run workflow** (manual run also uses the version from `tauri.conf.json`).

The workflow uploads **macOS**, **Windows**, and **Linux** bundles to a **draft** GitHub Release (`releaseDraft: true` in the workflow—publish it from the Releases page when ready). Ensure **Settings → Actions → General → Workflow permissions** allows **Read and write** so `GITHUB_TOKEN` can upload assets.

## License

MIT — see [`LICENSE`](LICENSE).
