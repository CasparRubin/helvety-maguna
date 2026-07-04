use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::error::{MagunaError, MagunaResult};

/// Per-user config, modes, and temp downloads (`modes.json`, `settings.json`, `tmp/`).
///
/// Uses Tauri `app.path().app_data_dir()`: on Windows typically `%APPDATA%\com.helvety.maguna\…`
/// (Roaming, **not** `%LOCALAPPDATA%`); on macOS `~/Library/Application Support/com.helvety.maguna/`;
/// on Linux typically `~/.local/share/com.helvety.maguna/` (respects `XDG_DATA_HOME` when set).
pub fn maguna_root(app: &tauri::AppHandle) -> MagunaResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| MagunaError::msg(e.to_string()))?;
    Ok(base.join("maguna"))
}

/// Canonical installed-model storage: `maguna_root/models` under the app identifier’s data
/// directory. The same path is used for dev, release, and installed builds so weights are not
/// tied to `target/debug` vs `target/release` vs `/Applications`.
pub fn models_dir(app: &tauri::AppHandle) -> MagunaResult<PathBuf> {
    let app_data_models = maguna_root(app)?.join("models");
    fs::create_dir_all(&app_data_models)?;
    Ok(app_data_models)
}

/// Roots that may still hold models from older Maguna versions (beside-exe installs and sibling
/// Cargo `target/debug` / `target/release` trees while developing from this repo).
pub fn legacy_models_search_roots(exe: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(beside) = install_adjacent_models_dir(exe) {
        roots.push(beside);
    }
    roots.extend(target_tree_models_dirs(exe));
    roots.sort();
    roots.dedup();
    roots
}

/// Next to the binary (`…/Helvety Maguna/Models`) or, for a macOS app bundle, `Helvety Maguna.app/Models`.
pub(crate) fn install_adjacent_models_dir(exe: &Path) -> Option<PathBuf> {
    let exe_dir = exe.parent()?;
    if exe_dir.file_name()?.to_str()? == "MacOS" {
        let contents = exe_dir.parent()?;
        if contents.file_name()?.to_str()? == "Contents" {
            let bundle = contents.parent()?;
            return Some(bundle.join("Models"));
        }
    }
    Some(exe_dir.join("Models"))
}

fn target_tree_models_dirs(exe: &Path) -> Vec<PathBuf> {
    let mut cur = Some(exe);
    while let Some(p) = cur {
        if p.file_name().and_then(|n| n.to_str()) == Some("target") {
            let target = p;
            return ["debug", "release"]
                .map(|profile| target.join(profile).join("Models"))
                .into_iter()
                .filter(|d| d.is_dir())
                .collect();
        }
        cur = p.parent();
    }
    vec![]
}

pub fn tmp_dir(app: &tauri::AppHandle) -> MagunaResult<PathBuf> {
    Ok(maguna_root(app)?.join("tmp"))
}

/// Basename of an in-flight catalog weight download under [`tmp_dir`] (`<model_id>.partial`).
/// Must stay aligned with [`crate::download::download_catalog_model`] and install-failure cleanup
/// in [`crate::commands::download_model`].
pub fn catalog_download_partial_filename(model_id: &str) -> String {
    format!("{model_id}.partial")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_path(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "maguna-paths-test-{label}-{}-{:?}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            std::thread::current().id(),
        ))
    }

    #[test]
    fn install_adjacent_models_dir_macos_bundle() {
        let exe = Path::new("/Applications/Helvety Maguna.app/Contents/MacOS/maguna");
        assert_eq!(
            install_adjacent_models_dir(exe),
            Some(PathBuf::from("/Applications/Helvety Maguna.app/Models"))
        );
    }

    #[cfg(windows)]
    #[test]
    fn install_adjacent_models_dir_windows_style() {
        let exe = Path::new(r"C:\Program Files\Helvety Maguna\maguna.exe");
        assert_eq!(
            install_adjacent_models_dir(exe),
            Some(PathBuf::from(r"C:\Program Files\Helvety Maguna\Models"))
        );
    }

    #[test]
    fn target_tree_models_dirs_finds_debug_and_release_profiles() {
        let base = tmp_path("target-tree");
        let target = base.join("src-tauri").join("target");
        let debug_models = target.join("debug").join("Models");
        let release_models = target.join("release").join("Models");
        fs::create_dir_all(&debug_models).unwrap();
        fs::create_dir_all(&release_models).unwrap();
        let exe = target.join("debug").join("maguna");

        let dirs = target_tree_models_dirs(&exe);
        assert_eq!(dirs.len(), 2);
        assert!(dirs.contains(&debug_models));
        assert!(dirs.contains(&release_models));

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn legacy_models_search_roots_includes_macos_bundle_models_dir() {
        let exe = Path::new("/Applications/Helvety Maguna.app/Contents/MacOS/maguna");
        let roots = legacy_models_search_roots(exe);
        assert!(roots.contains(&PathBuf::from("/Applications/Helvety Maguna.app/Models")));
    }

    #[test]
    fn legacy_models_search_roots_dedupes_beside_and_target_tree() {
        let base = tmp_path("legacy-roots");
        let target = base.join("target");
        let debug_models = target.join("debug").join("Models");
        fs::create_dir_all(&debug_models).unwrap();
        let exe = target.join("debug").join("maguna");

        let roots = legacy_models_search_roots(&exe);
        assert!(roots.contains(&debug_models));
        assert!(roots.contains(&target.join("debug").join("Models")));

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn catalog_download_partial_filename_shape() {
        assert_eq!(
            super::catalog_download_partial_filename("qwen3.5-9b-q4km"),
            "qwen3.5-9b-q4km.partial"
        );
        // Legacy stems with dots still map 1:1 to `.partial` basenames.
        assert_eq!(
            super::catalog_download_partial_filename("Qwen2.5-7B-Instruct-Q4_K_M"),
            "Qwen2.5-7B-Instruct-Q4_K_M.partial"
        );
    }
}
