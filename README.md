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
- **CMake** — required to compile `llama-cpp-4` from source on the first full build (`bun run dev`, `tauri build`). macOS: `brew install cmake libomp`; Windows/Linux: install [CMake](https://cmake.org/download/) (and on Windows, LLVM as above)
- **macOS deployment target 10.15+** — `llama-cpp-4` uses C++17 `std::filesystem`; [`src-tauri/.cargo/config.toml`](src-tauri/.cargo/config.toml) pins `MACOSX_DEPLOYMENT_TARGET=10.15`. If a release build fails with “`path` is unavailable: introduced in macOS 10.15”, run `node scripts/ensure-llama-cmake-cache.mjs` (also runs automatically before `bun run dev`) to drop a stale shared cmake cache under `src-tauri/target/llama-cmake-cache/`.

### Dependency policy

Direct dependencies are kept on **latest stable within the current major** (Bun **1.3.14**, Tauri **2.11**, React **19**, Vite **7**, etc.). Major bumps deferred until a dedicated migration: **ESLint 10**, **Tailwind 4**, **TypeScript 6**, **Vite 8** / **Vitest 4**.

## Quick start

```bash
bun install
bun run dev
```

That starts the full app: **Model library** (catalog, download, import, default model, guardrails custom policy), **Settings** (Helvety / Maguna basics, read-only guardrails reference, terms and disclaimers), and **Modes** (sidebar navigation plus per-mode workspaces; configure each mode from its page via **Edit configuration**).

### Using the app

- **Model library:** install models from the catalog or import a GGUF; set the **default** used by modes that do not override it. The embedded catalog (currently **version 5**) lists five **Q4_K_M** Hugging Face picks—**Ministral 3 8B** is highlighted as the recommended starting model; **Qwen 3 8B/14B**, **Gemma 4 12B**, and **DeepSeek R1 Distill Qwen 7B** are also available. Maguna ships **metadata only** (no bundled weights). Retired catalog ids (Qwen 2.5, Gemma 2, Mistral 7B v0.3) no longer appear for new downloads; GGUFs you already installed keep working. **Output guardrails:** a global policy paragraph is **always** prepended ahead of each mode’s system prompt (built-in wording by default). You may paste a **custom** paragraph instead; both are persisted in app settings (see configuration files below). Edits to custom text happen here; **Settings** shows the active policy read-only.
- **Settings (`/settings`):** **[Helvety](https://helvety.com)** link; **read-only** **built-in** guardrail paragraph (used whenever no custom paragraph is set); active **custom** policies also appear **read-only** when in use; safe-use guidelines; Helvety-authored **acceptable use** summary and liability disclaimers—**informational only** (not individualized legal counsel).
- **Modes (configuration):** each mode page shows the mode **name**, **Edit configuration** (top right, opens a **dialog** titled **Mode configuration**), then the workspace (**conversation** + composer for Chat, or **Input** / **Output** otherwise). In the dialog: **Name**, **System prompt**, **Model**, **Save mode**, **Duplicate**, **Reset to default** (built-in modes only), and **Delete** (custom modes only; built-ins cannot be removed). **Correction** and **Translate** layouts also include **Language in** and **Language out** (German and English today). **Chat** omits those selectors: reply language follows each user message automatically (fallback English when unclear). Inference always uses weights on device only—not a hosted API inside the app.
- **Correction / Translate pages:** compact **Input** and **Output** areas with **copy** controls; **Enter** runs (**Shift+Enter** adds a newline). Each successful finished run appears in **Archive** on that mode’s page.
- **Chat page:** **conversation** transcript where assistant turns are labeled **Maguna** in the UI (roles in storage and when calling the backend remain `user` / `assistant`). While a reply is generating, that label shows a subtle left-to-right highlight. **Composer** (**Enter** sends, **Shift+Enter** newline), **Send**, **Cancel**, **Paste and run**, and **New chat**. Transcript height tracks the main pane (`#main-content`) so the **Message** area and actions usually stay visible above **Archive**—scroll the page when you need the archive list. Completed replies update the current thread and are saved under **Archive** as **sessions** (full message history); open a row to continue, delete one chat, or **Clear archive**. Chat storage is separate per mode id (`localStorage` keys `maguna.chatSessions.v1:<modeId>` for Chat; correction/translate archives use `maguna.modeRunArchive.v1:<modeId>`).
- **Appearance:** sidebar **Light** / **Dark**; unsaved installs follow the OS. Choice is persisted (same key as [`index.html`](index.html)—see [`THEME_STORAGE_KEY`](src/context/theme-context.tsx) in [`src/context/theme-context.tsx`](src/context/theme-context.tsx)).

### Where models are stored

Weights live under a single **`Models`** directory (each catalog/import gets its own subfolder with `<model_id>.gguf` and `manifest.json`; older installs may still use `model.gguf`). Maguna picks that directory like this:

- **Windows** — normally **`Models` next to `maguna.exe`** (for example `C:\Program Files\Maguna\Models`). When you **develop** from this repo, the binary is usually `src-tauri\target\debug\maguna.exe`, so installs often land under **`…\target\debug\Models`**.  
  If beside-exe storage is unavailable or installs already live only under app data, Maguna uses **`%APPDATA%\com.helvety.maguna\maguna\models`** (Tauri’s `app_data_dir` is Roaming **`AppData`, not `Local`**).
- **macOS** — normally **`Maguna.app/Models`** next to `Contents` inside the `.app` bundle (for example `/Applications/Maguna.app/Models`). Otherwise **`~/Library/Application Support/com.helvety.maguna/maguna/models`**.
- **Linux** — same beside-exe rule as Windows when **`Models` next to the binary** is writable; otherwise weights under **`~/.local/share/com.helvety.maguna/maguna/models`** (or **`$XDG_DATA_HOME/com.helvety.maguna/maguna/models`** when `XDG_DATA_HOME` is set), following the XDG-style layout Tauri uses.

While catalog models **download**, the in-progress file is **`maguna/tmp/<model_id>.partial`** under Tauri’s per-user app data (for example **`%APPDATA%\com.helvety.maguna\maguna\tmp\`** on Windows, **`~/Library/Application Support/com.helvety.maguna/maguna/tmp/`** on macOS, typically **`~/.local/share/com.helvety.maguna/maguna/tmp/`** on Linux). After the stream (and a SHA256 check when the catalog lists one), Maguna **`rename`s** that file into **`Models`** when it is on the same volume, or **`copy`s** then **deletes** the partial when `Models` is on another drive. That step can take a long time across volumes; the UI shows **Finishing install**. Failed downloads, checksum mismatches, and failed installs **remove the partial when the OS allows it** so temp space is reclaimed; a rare error after a cross-volume copy may ask you to delete a leftover path manually.

In **Model library → Installed models**, use **Open models folder** for the **active** weights directory your file manager should open (**not** necessarily the `tmp` folder above).

### Configuration beside models

Under **`maguna/`** in the same Tauri app-data tree as **`tmp/`** (see paths above—for example **`…/maguna/modes.json`** on disk):

| File                | Contents                                                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`modes.json`**    | Mode list: ids, names, system prompts, layout, builtin flags                                                                                              |
| **`settings.json`** | Global default GGUF id, per-mode GGUF overrides, `guardrails_enabled` (legacy field; always treated as on at runtime), optional **custom guardrail** text |

Treat these as portable user data backups if you reinstall the shell.

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

To smoke-test a GGUF load + greedy decode outside the UI: `cargo run --example spike_load --features llama -- /path/to/model.gguf "prompt"`.

### Inference speed (CPU vs GPU, local vs API)

Running a **multi‑billion‑parameter** quantized model on **CPU alone** often means **tens of seconds to a minute or more** for prompt “prefill” on a laptop, plus time per token—it is normal compared to GPU servers.

- **This repo enables `llama-cpp-4`'s `metal` feature**, so **macOS** builds use **Apple's Metal GPU** for the heavy linear-algebra work after you rebuild (`bun run dev` / `tauri build`). Prefill and decoding are usually _dramatically_ faster than CPU-only linkage on a recent Mac.
- **Windows / Linux** builds here are still **CPU-only** unless someone wires **Vulkan** or **CUDA** through `llama-cpp-4` feature flags (different toolchains + drivers).
- **No cloud API is required.** For **fast** answers without tuning local GPU builds, vendors’ hosted APIs remain an option—it is a latency/cost/trade-secret trade-off, not a technical necessity.

Beyond hardware, smaller quant sizes (for example **8B** instead of **14B**), slightly coarser quantization, and shorter prompts/context all reduce wall-clock time offline. Some catalog models (notably **Qwen 3** and **DeepSeek R1**) may emit brief reasoning-style traces before the final answer—normal for those families, not a sign of a broken install.

## GitHub releases (downloadable builds)

CI builds and tests on every push in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). **Installers** are produced by [`.github/workflows/release.yml`](.github/workflows/release.yml):

1. Bump **`version`** in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) if needed (it must match the tag, e.g. `0.1.0` → tag `v0.1.0`).
2. Commit and push to `main`.
3. Create and push a tag: `git tag v0.1.0 && git push origin v0.1.0`  
   Or open **Actions → Release → Run workflow** (manual run also uses the version from `tauri.conf.json`).

The workflow uploads **macOS**, **Windows**, and **Linux** bundles to a **draft** GitHub Release (`releaseDraft: true` in the workflow—publish it from the Releases page when ready). Ensure **Settings → Actions → General → Workflow permissions** allows **Read and write** so `GITHUB_TOKEN` can upload assets.

## License

MIT — see [`LICENSE`](LICENSE).
