# iOS, iPadOS, and mobile roadmap

Maguna is currently oriented toward **Windows 11 desktop**. Tauri 2 supports **iOS** and **Android** targets from the same project template, but this repository does **not** yet ship mobile binaries.

## Architectural note: `InferenceEngine`

Desktop builds can use **llama.cpp** (GGUF) when compiled with `--features llama`. Mobile devices impose stricter **RAM**, **thermal**, and **battery** constraints, and may require:

- A **smaller curated catalog** (quantizations and context lengths appropriate for phones), and/or
- An alternate backend (for example **Metal**-accelerated paths or smaller runtimes) behind the same high-level “load model → stream tokens” contract.

Keeping **downloads user-initiated** and **on-device inference** explicit in the App Store privacy narrative is important for review.

## UI

The React layout should use **responsive** spacing and touch targets if you enable iPadOS; the sidebar navigation may become a tab bar or drawer on narrow widths.

## Next steps when you pick up mobile

1. Follow Tauri’s **iOS** setup (`tauri ios init`, Xcode, signing).
2. Prototype model load + streaming on a **single reference device**.
3. Revisit the catalog format with a `platform` or `max_ram_mb` filter for mobile-safe entries.
