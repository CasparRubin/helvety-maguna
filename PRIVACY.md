# Maguna — privacy overview

## What stays on your device

- **Text you send through Modes** (your prompts and model output) is processed by a **local** inference engine when you use a build that includes the `llama` feature and have loaded a GGUF model. It is **not** sent to a remote large-language-model API for inference.

## What may leave your device

- **Downloading models**: the app fetches weight files over HTTPS from the URLs listed in the curated catalog (for example Hugging Face `resolve` links). That traffic carries **only** the file bytes needed to store the model on disk, not your prompts.
- **Optional catalog updates**: a future version might fetch an updated `catalog.json` from a static host (for example GitHub). That would be metadata only, not your writing.
- **Operating system**: standard OS services (Windows Update, antivirus telemetry, etc.) are outside Maguna’s control.

## Telemetry

This repository snapshot does **not** enable third-party analytics or crash reporting by default.

## Microsoft Store / app stores

Store listings require a privacy policy URL. This document is suitable as a starting point; adjust for your legal entity and final data practices before publication.
