use serde::Deserialize;
use tracing::debug;

use crate::error::{MagunaError, MagunaResult};

#[derive(Debug, Clone, Deserialize)]
pub struct CatalogFile {
    pub version: u32,
    pub models: Vec<CatalogModel>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct CatalogModel {
    pub id: String,
    /// Company or team that released the base model weights.
    pub maker: String,
    pub display_name: String,
    pub description: String,
    pub url: String,
    pub sha256: Option<String>,
    pub size_bytes: u64,
    pub languages: Vec<String>,
    pub license_note: String,
    pub hf_repo: String,
    /// Chat framing key (`chat_template`): `tinyllama_v1`, `llama3_instruct`, `mistral_instruct`,
    /// `qwen2_instruct`, `gemma2_it`, `mistral3_instruct`, `moonshot_instruct` (`kimi_k2`/`kimi` aliases), etc.—must match
    /// the instruct GGUF layout.
    #[serde(default = "default_chat_template")]
    pub chat_template: String,
    /// Public release of this checkpoint family (`YYYY-MM-DD`), from upstream cards; optional.
    #[serde(default)]
    pub release_date: Option<String>,
}

fn default_chat_template() -> String {
    "tinyllama_v1".to_string()
}

pub fn load_catalog() -> MagunaResult<CatalogFile> {
    const RAW: &str = include_str!("../resources/catalog.json");
    let file: CatalogFile =
        serde_json::from_str(RAW).map_err(|e| MagunaError::Catalog(e.to_string()))?;
    debug!(schema_version = file.version, "loaded embedded catalog");
    Ok(file)
}

pub fn find_catalog_model(id: &str) -> MagunaResult<CatalogModel> {
    let cat = load_catalog()?;
    cat.models
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| MagunaError::ModelNotFound(id.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{find_catalog_model, load_catalog};

    const LEGACY_V4_IDS: &[&str] = &[
        "qwen2.5-14b-instruct-q4km",
        "qwen2.5-7b-instruct-q4km",
        "gemma-2-9b-it-q4km",
        "mistral-7b-instruct-v03-q4km",
    ];

    #[test]
    fn bundled_catalog_is_version_5_with_five_models() {
        let cat = load_catalog().expect("embedded catalog.json");
        assert_eq!(cat.version, 5);
        assert_eq!(cat.models.len(), 5);
    }

    #[test]
    fn catalog_dropped_legacy_v4_ids() {
        let ids: Vec<String> = load_catalog()
            .expect("catalog")
            .models
            .into_iter()
            .map(|m| m.id)
            .collect();
        for legacy in LEGACY_V4_IDS {
            assert!(
                !ids.iter().any(|id| id == legacy),
                "legacy id still in catalog: {legacy}"
            );
        }
    }

    #[test]
    fn catalog_v5_ids_and_templates() {
        let qwen3 = find_catalog_model("qwen3-14b-q4km").expect("qwen3 14b");
        assert_eq!(qwen3.chat_template, "qwen2_instruct");
        assert_eq!(qwen3.size_bytes, 9_001_753_632);

        let gemma4 = find_catalog_model("gemma-4-12b-it-q4km").expect("gemma4");
        assert_eq!(gemma4.chat_template, "gemma2_it");
        assert_eq!(gemma4.size_bytes, 7_381_382_048);

        let ministral = find_catalog_model("ministral-3-8b-instruct-q4km").expect("ministral3");
        assert_eq!(ministral.chat_template, "mistral3_instruct");
        assert_eq!(ministral.size_bytes, 5_198_387_456);

        let deepseek = find_catalog_model("deepseek-r1-distill-qwen-7b-q4km").expect("deepseek");
        assert_eq!(deepseek.chat_template, "qwen2_instruct");
        assert_eq!(deepseek.size_bytes, 4_683_073_504);

        let qwen3_8b = find_catalog_model("qwen3-8b-q4km").expect("qwen3 8b");
        assert_eq!(qwen3_8b.chat_template, "qwen2_instruct");
        assert_eq!(qwen3_8b.size_bytes, 5_027_784_224);
    }

    #[test]
    fn catalog_size_order_when_sorted() {
        let mut models = load_catalog().expect("catalog").models;
        models.sort_by_key(|m| m.size_bytes);
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "deepseek-r1-distill-qwen-7b-q4km",
                "qwen3-8b-q4km",
                "ministral-3-8b-instruct-q4km",
                "gemma-4-12b-it-q4km",
                "qwen3-14b-q4km",
            ]
        );
    }
}
