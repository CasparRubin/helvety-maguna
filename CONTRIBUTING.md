# Contributing

Thank you for your interest in Maguna.

- Use focused PRs and describe **what** changed and **why**.
- Run **`npm run check`** before opening a PR (Prettier, ESLint, Vitest, `tsc` + Vite build, `cargo fmt` / `clippy` / `tests` without the `llama` feature). For inference changes, also verify locally with **`npm run dev:llama`** or **`npm run build:llama`** where LLVM is available.
- Follow existing TypeScript / Rust style; avoid unrelated refactors in the same PR.
- For UI work, keep accessibility in mind (labels, keyboard focus, `aria-live` for streaming regions).

If you are unsure about scope, open an issue first with a short proposal.
