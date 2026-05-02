# Maguna

**Maguna** is a free, open-source, **100% on-device** desktop harness for local GGUF models. You pick a model, then run **Modes**: built-in Correction and Translate ship small default **system** prompts (EN/DE); everything else is user-defined. Network access is used only to **download model weight files** (for example from Hugging Face), not to run cloud inference.

## Stack

- **Tauri 2** + **Rust** (model lifecycle, downloads, inference)
- **React** + **TypeScript** + **Vite** + **Tailwind** + **shadcn-style** UI components
- **llama.cpp** (optional) via the [`llama_cpp`](https://crates.io/crates/llama_cpp) crate when built with `--features llama`

## Development

```bash
npm install
npm run dev
```

This runs **`tauri dev`** (desktop shell + Vite): model catalog, downloads, and import work; **local inference (Modes) needs llama.cpp**, linked only when you build with the `llama` feature (requires **LLVM / libclang** on the build machine).

| Command                                            | Use case                                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                      | Default: no llama.cpp — lighter compile, no local LLM                                                                                                  |
| **`npm run dev:llama`**                            | Full app including Modes inference (set **`LIBCLANG_PATH`** to LLVM’s `bin` on Windows; see [docs/BUILD.md](docs/BUILD.md))                            |
| **`npm run dev:llama:win`**                        | **Windows:** installs nothing — auto-picks LLVM `bin` if `libclang.dll` is there, then runs `dev:llama`                                                |
| `npm run dev:vite`                                 | Vite only for UI; no Tauri IPC in a normal browser tab                                                                                                 |
| `npm run build:llama` / **`build:llama:win`**      | Release **with** inference                                                                                                                             |
| **`npm run check`**                                | Full gate: Prettier + Rust fmt, ESLint, Vitest, `tsc` + Vite build, `cargo clippy` + tests (matches [CI](.github/workflows/ci.yml) on Windows & macOS) |
| `npm run lint` / `npm run test` / `npm run format` | Individual steps                                                                                                                                       |

### Local inference (`llama` feature)

The default `cargo` / `npm run tauri dev` build **does not** link llama.cpp (so you do not need LLVM on every machine). To enable **real** GGUF inference:

1. Install **LLVM** so `libclang` is available (Windows: install [LLVM](https://releases.llvm.org/) and ensure `LIBCLANG_PATH` points at the `bin` directory containing `libclang.dll`).
2. Build with the feature:

```bash
cd src-tauri
cargo build --features llama --release
```

Or from the repo root:

```bash
npm run tauri build -- --features llama
```

See [docs/BUILD.md](docs/BUILD.md) for more detail.

## Privacy

Maguna does not send your prompts or completions to a remote LLM service. See [PRIVACY.md](PRIVACY.md).

## Distribution

Microsoft Store (MSIX) and Apple notarization notes live under [docs/](docs/).

## License

Application source is licensed under the MIT License — see [LICENSE](LICENSE). Third-party components and model weights have their own terms — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
