use serde::Deserialize;

use crate::error::{MagunaError, MagunaResult};

#[derive(Debug, Clone, Deserialize)]
pub struct CatalogFile {
    #[allow(dead_code)]
    pub version: u32,
    pub models: Vec<CatalogModel>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct CatalogModel {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub url: String,
    pub sha256: Option<String>,
    pub size_bytes: u64,
    pub languages: Vec<String>,
    pub license_note: String,
    pub hf_repo: String,
    /// Chat template key: `tinyllama_v1`, `llama3_instruct`, `mistral_instruct`, `qwen2_instruct`,
    /// `gemma2_it`, `moonshot_instruct` — must match instruct format of the GGUF.
    #[serde(default = "default_chat_template")]
    pub chat_template: String,
}

fn default_chat_template() -> String {
    "tinyllama_v1".to_string()
}

pub fn load_catalog() -> MagunaResult<CatalogFile> {
    const RAW: &str = include_str!("../resources/catalog.json");
    serde_json::from_str(RAW).map_err(|e| MagunaError::Catalog(e.to_string()))
}

pub fn find_catalog_model(id: &str) -> MagunaResult<CatalogModel> {
    let cat = load_catalog()?;
    cat.models
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| MagunaError::ModelNotFound(id.to_string()))
}
