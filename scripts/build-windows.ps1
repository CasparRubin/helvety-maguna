# Sets LIBCLANG_PATH / NM_PATH for bindgen, then runs a full Tauri production build (default features include the engine).
$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$candidates = @(
    $env:LIBCLANG_PATH,
    "${env:ProgramFiles}\LLVM\bin",
    "${env:ProgramFiles(x86)}\LLVM\bin"
) | Where-Object { $_ -and (Test-Path (Join-Path $_ "libclang.dll")) }

$bin = $candidates | Select-Object -First 1

if (-not $bin) {
    Write-Host "libclang.dll not found. Install LLVM (winget install LLVM.LLVM) or set LIBCLANG_PATH. See README (Requirements)." -ForegroundColor Red
    exit 1
}

$env:LIBCLANG_PATH = $bin
$llvmNm = Join-Path $bin "llvm-nm.exe"
if (Test-Path $llvmNm) {
    $env:NM_PATH = $llvmNm
} else {
    Write-Host "Warning: llvm-nm.exe not found next to libclang.dll. Build may fail." -ForegroundColor Yellow
}
$env:PATH = "$bin;$env:PATH"

Write-Host "LIBCLANG_PATH=$($env:LIBCLANG_PATH)" -ForegroundColor Green
if ($env:NM_PATH) { Write-Host "NM_PATH=$($env:NM_PATH)" -ForegroundColor Green }
bunx tauri build
