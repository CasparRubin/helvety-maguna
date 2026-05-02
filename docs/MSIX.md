# Microsoft Store (MSIX) checklist

This document is guidance for packaging **Maguna** for the Microsoft Store. Adjust identifiers, publisher names, and legal text for your organization.

## 1. MSIX packaging

- Tauri can produce **MSIX** bundles; follow the current [Tauri distribution](https://v2.tauri.app/distribute/) documentation for `tauri build` MSIX targets.
- Use a consistent **application identity** (the project already uses a reverse-DNS style identifier in `tauri.conf.json`).

## 2. Code signing

- Store submissions require **Authenticode** signing with a certificate trusted for Windows publishing (often an **EV** code signing certificate for smoother SmartScreen reputation).
- Sign both the MSIX and any standalone installers you ship outside the Store.

## 3. Capabilities

Declare only what you need:

- **Internet**: yes, for downloading model files and optional catalog updates. Make clear in the Store listing that this is **not** cloud inference.
- Avoid broad capabilities (e.g. broad file system) unless strictly required; the app currently writes under the per-user app data directory via normal APIs.

## 4. Store listing assets

Prepare screenshots, description, and **privacy policy URL** (see `PRIVACY.md` as a starting point).

## 5. Model size and expectations

Large downloads can affect Store review and user expectations. Prefer:

- A **small** optional starter model or a guided first-run download, and
- Clear in-app disclosure of download size and disk space requirements.

## 6. Updates

Decide between **Store-managed updates** only versus additional channels (for example GitHub Releases for sideloading). Document the chosen strategy in the README for power users.
