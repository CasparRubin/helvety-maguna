use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::error::{MagunaError, MagunaResult};

/// Per-user config, modes, and temp downloads (`modes.json`, `settings.json`, `tmp/`).
///
/// Uses Tauri `app.path().app_data_dir()`. On Windows that is typically
/// `%APPDATA%\com.helvety.maguna\…` (Roaming), **not** `%LOCALAPPDATA%`.
pub fn maguna_root(app: &tauri::AppHandle) -> MagunaResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| MagunaError::msg(e.to_string()))?;
    Ok(base.join("maguna"))
}

/// `Models/` next to the app install when possible (same folder as the executable on
/// Windows/Linux; sibling of `Contents` inside a `.app` bundle on macOS). Falls back to
/// `maguna_root/models` under the app identifier’s data directory when beside `Models` is not
/// writable or when installs already live only there.
pub fn models_dir(app: &tauri::AppHandle) -> MagunaResult<PathBuf> {
    let app_data_models = maguna_root(app)?.join("models");
    let beside = std::env::current_exe()
        .ok()
        .and_then(|exe| install_adjacent_models_dir(&exe));

    let Some(beside) = beside else {
        fs::create_dir_all(&app_data_models)?;
        return Ok(app_data_models);
    };

    let app_data_populated = app_data_models.is_dir() && dir_has_installed_model(&app_data_models);
    let beside_populated = beside.is_dir() && dir_has_installed_model(&beside);

    if beside_populated {
        return Ok(beside);
    }
    if app_data_populated {
        return Ok(app_data_models);
    }

    if fs::create_dir_all(&beside).is_ok() {
        return Ok(beside);
    }

    fs::create_dir_all(&app_data_models)?;
    Ok(app_data_models)
}

/// Next to the binary (`…/Maguna/Models`) or, for a macOS app bundle, `Maguna.app/Models`.
fn install_adjacent_models_dir(exe: &Path) -> Option<PathBuf> {
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

fn dir_has_installed_model(root: &Path) -> bool {
    let Ok(rd) = fs::read_dir(root) else {
        return false;
    };
    for entry in rd.flatten() {
        let p = entry.path();
        if p.is_dir() && p.join("manifest.json").is_file() {
            return true;
        }
    }
    false
}

pub fn tmp_dir(app: &tauri::AppHandle) -> MagunaResult<PathBuf> {
    Ok(maguna_root(app)?.join("tmp"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_adjacent_models_dir_macos_bundle() {
        let exe = Path::new("/Applications/Maguna.app/Contents/MacOS/maguna");
        assert_eq!(
            install_adjacent_models_dir(exe),
            Some(PathBuf::from("/Applications/Maguna.app/Models"))
        );
    }

    #[test]
    fn install_adjacent_models_dir_windows_style() {
        let exe = Path::new(r"C:\Program Files\Maguna\maguna.exe");
        assert_eq!(
            install_adjacent_models_dir(exe),
            Some(PathBuf::from(r"C:\Program Files\Maguna\Models"))
        );
    }
}
