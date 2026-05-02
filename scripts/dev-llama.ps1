# Sets LIBCLANG_PATH for bindgen (llama_cpp_sys) then runs Tauri dev with the llama feature.
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
    Write-Host ""
    Write-Host "bindgen could not find libclang.dll (LLVM)." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install LLVM, then run this script again:" -ForegroundColor Yellow
    Write-Host "  winget install LLVM.LLVM --accept-package-agreements --accept-source-agreements"
    Write-Host ""
    Write-Host "Or install from https://github.com/llvm/llvm-project/releases" -ForegroundColor Yellow
    Write-Host "Then set the folder that contains libclang.dll, e.g.:" -ForegroundColor Yellow
    Write-Host '  $env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"' -ForegroundColor Cyan
    Write-Host "  bun run dev:llama" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "See README.md (Building with local inference)" -ForegroundColor DarkGray
    exit 1
}

$env:LIBCLANG_PATH = $bin
# llama_cpp_sys also invokes llvm-nm during the build; it must be on PATH or NM_PATH.
$llvmNm = Join-Path $bin "llvm-nm.exe"
if (Test-Path $llvmNm) {
    $env:NM_PATH = $llvmNm
} else {
    Write-Host "Warning: llvm-nm.exe not found next to libclang.dll. Build may fail." -ForegroundColor Yellow
}
$env:PATH = "$bin;$env:PATH"

Write-Host "LIBCLANG_PATH=$($env:LIBCLANG_PATH)" -ForegroundColor Green
if ($env:NM_PATH) { Write-Host "NM_PATH=$($env:NM_PATH)" -ForegroundColor Green }
bunx tauri dev --features llama
