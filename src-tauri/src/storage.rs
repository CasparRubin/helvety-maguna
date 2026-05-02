use std::fs;
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
    /// `tinyllama_v1`, `llama3_instruct`, or `mistral_instruct`; empty = infer from model id.
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
        out.push(InstalledModelDto {
            id: m.id.clone(),
            display_name: m.display_name,
            gguf_path: m.gguf_path.to_string_lossy().to_string(),
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
    let dest = dir.join("model.gguf");
    if dest.exists() {
        fs::remove_file(&dest)?;
    }
    if fs::rename(&gguf_path, &dest).is_err() {
        fs::copy(&gguf_path, &dest)?;
        let _ = fs::remove_file(&gguf_path);
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

pub fn delete_installed(app: &tauri::AppHandle, model_id: &str) -> MagunaResult<()> {
    let dir = paths::models_dir(app)?.join(model_id);
    if dir.exists() {
        fs::remove_dir_all(&dir)?;
    }
    Ok(())
}

pub fn resolve_gguf_path(app: &tauri::AppHandle, model_id: &str) -> MagunaResult<PathBuf> {
    let dir = paths::models_dir(app)?.join(model_id);
    let m = read_manifest(&dir)?;
    if !m.gguf_path.exists() {
        return Err(MagunaError::msg("GGUF file missing on disk"));
    }
    Ok(m.gguf_path)
}
