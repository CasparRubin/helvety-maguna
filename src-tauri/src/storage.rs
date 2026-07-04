use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::catalog::CatalogModel;
use crate::error::{MagunaError, MagunaResult};
use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledManifest {
    pub id: String,
    pub display_name: String,
    pub gguf_path: PathBuf,
    pub sha256: Option<String>,
    pub source_url: Option<String>,
    /// Catalog-style key (`qwen2_instruct`, `qwen2_instruct_reasoning`, `gemma4_it`, `mistral3_instruct`, `glm4_instruct`, `glm47_flash`, `glm4_z1`, …).
    /// Empty = infer from model id / hint.
    #[serde(default)]
    pub chat_template: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstalledModelDto {
    pub id: String,
    pub display_name: String,
    pub gguf_path: String,
    pub sha256: Option<String>,
    pub chat_template: String,
}

pub fn manifest_path(model_dir: &Path) -> PathBuf {
    model_dir.join("manifest.json")
}

/// Weight file name beside `manifest.json` for new installs (`<model_id>.gguf`).
pub fn weights_filename(model_id: &str) -> String {
    format!("{model_id}.gguf")
}

/// Removes the catalog download staging file after a successful cross-volume `copy` into
/// `Models/`. Must succeed or we leak a second full copy of multi-GB weights under `tmp/`.
///
/// Retries on Windows where AV or transient locks often cause an initial `remove_file` failure.
pub(crate) fn remove_download_staging_file(path: &Path) -> MagunaResult<()> {
    let attempts = if cfg!(windows) { 5 } else { 1 };
    let mut last_err: Option<std::io::Error> = None;
    for i in 0..attempts {
        if i > 0 {
            let shift = (i - 1).min(4);
            std::thread::sleep(std::time::Duration::from_millis(50 << shift));
        }
        match fs::remove_file(path) {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => return Ok(()),
            Err(e) => last_err = Some(e),
        }
    }
    Err(MagunaError::msg(format!(
        "could not remove temporary weights file after copying to Models (you may have duplicate copies; delete manually at {}): {}",
        path.display(),
        last_err
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown".to_string())
    )))
}

/// Resolves the GGUF on disk: prefers the path stored in the manifest, then the older fixed
/// name `model.gguf`, then `<id>.gguf` in the model directory.
pub fn effective_gguf_path(model_dir: &Path, m: &InstalledManifest) -> MagunaResult<PathBuf> {
    if m.gguf_path.is_file() {
        return Ok(m.gguf_path.clone());
    }
    let legacy = model_dir.join("model.gguf");
    if legacy.is_file() {
        return Ok(legacy);
    }
    let named = model_dir.join(weights_filename(&m.id));
    if named.is_file() {
        return Ok(named);
    }
    Err(MagunaError::msg("GGUF file missing on disk"))
}

pub fn read_manifest(dir: &Path) -> MagunaResult<InstalledManifest> {
    let p = manifest_path(dir);
    let raw = fs::read_to_string(&p)?;
    serde_json::from_str(&raw).map_err(|e| MagunaError::msg(format!("invalid manifest: {e}")))
}

pub fn write_manifest(dir: &Path, m: &InstalledManifest) -> MagunaResult<()> {
    fs::create_dir_all(dir)?;
    let p = manifest_path(dir);
    fs::write(
        p,
        serde_json::to_string_pretty(m).map_err(|e| MagunaError::msg(e.to_string()))?,
    )?;
    Ok(())
}

pub fn list_installed(app: &tauri::AppHandle) -> MagunaResult<Vec<InstalledModelDto>> {
    let root = paths::models_dir(app)?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut out = vec![];
    for entry in fs::read_dir(&root).map_err(MagunaError::from)? {
        let entry = entry.map_err(MagunaError::from)?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if !manifest_path(&path).exists() {
            continue;
        }
        let m = read_manifest(&path)?;
        let gguf_path = effective_gguf_path(&path, &m)
            .unwrap_or_else(|_| m.gguf_path.clone())
            .to_string_lossy()
            .into_owned();
        out.push(InstalledModelDto {
            id: m.id.clone(),
            display_name: m.display_name,
            gguf_path,
            sha256: m.sha256,
            chat_template: m.chat_template.clone(),
        });
    }
    out.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(out)
}

pub fn install_from_catalog(
    app: &tauri::AppHandle,
    catalog: &CatalogModel,
    gguf_path: PathBuf,
) -> MagunaResult<()> {
    let dir = paths::models_dir(app)?.join(&catalog.id);
    fs::create_dir_all(&dir)?;
    let dest = dir.join(weights_filename(&catalog.id));
    let legacy = dir.join("model.gguf");
    if legacy.exists() && legacy != dest {
        let _ = fs::remove_file(&legacy);
    }
    if dest.exists() {
        fs::remove_file(&dest)?;
    }
    if fs::rename(&gguf_path, &dest).is_err() {
        fs::copy(&gguf_path, &dest)?;
        remove_download_staging_file(&gguf_path)?;
    }
    let manifest = InstalledManifest {
        id: catalog.id.clone(),
        display_name: catalog.display_name.clone(),
        gguf_path: dest,
        sha256: catalog.sha256.clone(),
        source_url: Some(catalog.url.clone()),
        chat_template: catalog.chat_template.clone(),
    };
    write_manifest(&dir, &manifest)?;
    Ok(())
}

fn validate_model_id(model_id: &str) -> MagunaResult<()> {
    if model_id.is_empty()
        || model_id.contains('/')
        || model_id.contains('\\')
        || model_id.contains("..")
    {
        return Err(MagunaError::msg("invalid model id"));
    }
    Ok(())
}

/// Directories that may contain an installed model folder (`models_dir()` and app-data
/// `maguna/models` when they differ).
fn model_install_roots(app: &tauri::AppHandle) -> MagunaResult<Vec<PathBuf>> {
    let current = paths::models_dir(app)?;
    let fallback = paths::maguna_root(app)?.join("models");
    if current == fallback {
        return Ok(vec![current]);
    }
    Ok(vec![current, fallback])
}

/// Permanently removes the model from disk: the GGUF weight file, `manifest.json`, and the
/// whole per-model directory under Maguna storage (checks beside-exe `Models` and app-data
/// `maguna/models` when those roots differ).
pub fn delete_installed(app: &tauri::AppHandle, model_id: &str) -> MagunaResult<()> {
    validate_model_id(model_id)?;
    for root in model_install_roots(app)? {
        let dir = root.join(model_id);
        if !dir.exists() {
            continue;
        }
        // Drop the weight file first so Windows releases any mmap before removing the tree.
        if let Ok(manifest) = read_manifest(&dir) {
            if let Ok(weight) = effective_gguf_path(&dir, &manifest) {
                let _ = fs::remove_file(weight);
            }
        }
        fs::remove_dir_all(&dir)?;
    }
    Ok(())
}

pub fn resolve_gguf_path(app: &tauri::AppHandle, model_id: &str) -> MagunaResult<PathBuf> {
    let dir = paths::models_dir(app)?.join(model_id);
    let m = read_manifest(&dir)?;
    effective_gguf_path(&dir, &m)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_model_dir() -> PathBuf {
        // Nanoseconds alone can collide when tests run in parallel; include thread id.
        let p = std::env::temp_dir().join(format!(
            "maguna-storage-test-{}-{:?}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            std::thread::current().id(),
        ));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn manifest_stub(id: &str, gguf_path: PathBuf) -> InstalledManifest {
        InstalledManifest {
            id: id.to_string(),
            display_name: "Test".to_string(),
            gguf_path,
            sha256: None,
            source_url: None,
            chat_template: String::new(),
        }
    }

    #[test]
    fn weights_filename_appends_dot_gguf() {
        assert_eq!(weights_filename("qwen2.5-7b"), "qwen2.5-7b.gguf");
    }

    #[test]
    fn effective_uses_manifest_path_when_file_exists() {
        let dir = tmp_model_dir();
        let weight = dir.join("weights.gguf");
        fs::write(&weight, b"x").unwrap();
        let m = manifest_stub("m1", weight.clone());
        assert_eq!(effective_gguf_path(&dir, &m).unwrap(), weight);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn effective_falls_back_to_model_gguf() {
        let dir = tmp_model_dir();
        let legacy = dir.join("model.gguf");
        fs::write(&legacy, b"x").unwrap();
        let m = manifest_stub("m1", dir.join("missing.gguf"));
        assert_eq!(effective_gguf_path(&dir, &m).unwrap(), legacy);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn effective_falls_back_to_id_named_gguf() {
        let dir = tmp_model_dir();
        let named = dir.join(weights_filename("my-model"));
        fs::write(&named, b"x").unwrap();
        let m = manifest_stub("my-model", dir.join("missing.gguf"));
        assert_eq!(effective_gguf_path(&dir, &m).unwrap(), named);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn effective_errors_when_no_weight_file() {
        let dir = tmp_model_dir();
        let m = manifest_stub("x", dir.join("nope.gguf"));
        assert!(effective_gguf_path(&dir, &m).is_err());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_download_staging_file_deletes_existing() {
        let dir = tmp_model_dir();
        let p = dir.join(paths::catalog_download_partial_filename("x"));
        fs::write(&p, b"x").unwrap();
        remove_download_staging_file(&p).unwrap();
        assert!(!p.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_download_staging_file_ok_when_already_missing() {
        let dir = tmp_model_dir();
        let p = dir.join(paths::catalog_download_partial_filename("gone"));
        remove_download_staging_file(&p).unwrap();
        let _ = fs::remove_dir_all(&dir);
    }

    /// `remove_download_staging_file` must not report success if the temp file could not be
    /// removed after a copy (otherwise we silently leak a duplicate multi-GB file).
    #[test]
    fn remove_download_staging_file_errors_when_target_is_directory() {
        let dir = tmp_model_dir();
        let p = dir.join(paths::catalog_download_partial_filename("isdir"));
        fs::create_dir_all(&p).unwrap();
        let err = remove_download_staging_file(&p).expect_err("unlink of directory should fail");
        assert!(
            err.to_string().contains("could not remove temporary"),
            "unexpected error: {err}"
        );
        let _ = fs::remove_dir_all(&p);
        let _ = fs::remove_dir_all(&dir);
    }
}
