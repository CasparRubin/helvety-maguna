# Build notes

## Default (no llama.cpp)

```bash

npm install

npm run dev

```

This supports the **full UI** and **model download / install / delete**, but **not** local Modes inference (no llama.cpp in the binary).

## With GGUF inference (`llama` feature)

Building `llama_cpp_sys` compiles **llama.cpp** from source and runs **bindgen**, which requires **libclang** on the machine that compiles the Rust crate.

### Windows (typical errors: `Unable to find libclang`, `No suitable tool equivalent to "nm"`)

1. **Install LLVM** (provides `libclang.dll`):

   ```powershell

   winget install LLVM.LLVM --accept-package-agreements --accept-source-agreements

   ```

   Or download an installer from the [LLVM releases](https://github.com/llvm/llvm-project/releases) page.

2. **Point the Rust build at LLVM’s `bin` folder** (needs `libclang.dll` for bindgen and `llvm-nm.exe` for `llama_cpp_sys`). Easiest on PowerShell:

   ```powershell

   npm run dev:llama:win

   ```

   That script sets `LIBCLANG_PATH`, prepends LLVM `bin` to `PATH`, and sets `NM_PATH` to `llvm-nm.exe` when present, then runs `tauri dev --features llama`.

   **Manual** (same terminal session):

   ```powershell

   $b = "C:\Program Files\LLVM\bin"

   $env:LIBCLANG_PATH = $b

   $env:NM_PATH = "$b\llvm-nm.exe"

   $env:PATH = "$b;$env:PATH"

   npm run dev:llama

   ```

   If LLVM is elsewhere, use that **`bin`** directory for all three.

3. **Release with inference:**

   ```powershell

   npm run build:llama:win

   ```

   or set `LIBCLANG_PATH`, `PATH` / `NM_PATH` as above, then `npm run build:llama`.

### macOS

`xcode-select --install` is usually enough. Then:

```bash

npm run dev:llama

```

### Linux

Install `clang` and `libclang-dev` (names vary). Then:

```bash

npm run dev:llama

```

### From `src-tauri` only

```bash

cd src-tauri

cargo build --features llama --release

```

Release builds are strongly recommended for interactive inference performance.

## Optional: CUDA / Vulkan

The `llama_cpp` crate exposes optional features (`cuda`, `vulkan`, …). Enabling them requires matching SDKs on the build machine. Start with CPU-only builds; add GPU features when you are ready to maintain the extra toolchain.
