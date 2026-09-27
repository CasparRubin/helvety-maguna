use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    tauri_build::build();
    link_mtmd_vendor_hash();
}

/// llama-cpp-sys-4 builds `libvendor-hash.a` for mtmd but does not install it
/// into cmake's `lib/` prefix, so the Maguna binary is missing `hash_sha256_hex`.
fn link_mtmd_vendor_hash() {
    if std::env::var_os("CARGO_FEATURE_LLAMA").is_none() {
        return;
    }

    let manifest_dir =
        PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let cache_root = manifest_dir.join("target").join("llama-cmake-cache");
    let Some(archive) = find_vendor_hash_archive(&cache_root) else {
        println!(
            "cargo:warning=libvendor-hash not found under {}; mtmd may fail to link",
            cache_root.display()
        );
        return;
    };

    let dir = archive.parent().expect("vendor-hash archive parent");
    println!("cargo:rerun-if-changed={}", archive.display());
    println!("cargo:rustc-link-search=native={}", dir.display());
    println!("cargo:rustc-link-lib=static=vendor-hash");
}

fn find_vendor_hash_archive(cache_root: &Path) -> Option<PathBuf> {
    let names = ["libvendor-hash.a", "vendor-hash.lib"];
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in fs::read_dir(cache_root).ok()?.flatten() {
        let hash_dir = entry.path().join("build").join("vendor").join("hash");
        for name in names {
            let candidate = hash_dir.join(name);
            let Ok(meta) = fs::metadata(&candidate) else {
                continue;
            };
            let Ok(modified) = meta.modified() else {
                continue;
            };
            if best.as_ref().is_none_or(|(t, _)| modified >= *t) {
                best = Some((modified, candidate));
            }
        }
    }
    best.map(|(_, path)| path)
}
