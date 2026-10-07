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
    /// `qwen2_instruct`, `qwen2_instruct_reasoning`, `gemma2_it`, `gemma4_it`, `mistral3_instruct`,
    /// `moonshot_instruct` (`kimi_k2`/`kimi` aliases), `phi4_instruct`, `hunyuan_dense`,
    /// `glm4_instruct`, `glm47_flash`, `glm4_z1`, `gpt_oss`, `muse_glimmer`, `eurollm_instruct`,
    /// etc.—must match the instruct GGUF layout.
    #[serde(default = "default_chat_template")]
    pub chat_template: String,
    /// Public release of this checkpoint family (`YYYY-MM-DD`), from upstream cards; optional.
    #[serde(default)]
    pub release_date: Option<String>,
    /// Optional vision projector GGUF (mmproj) for Chat image attach via mtmd.
    #[serde(default)]
    pub mmproj_url: Option<String>,
    #[serde(default)]
    pub mmproj_sha256: Option<String>,
    #[serde(default)]
    pub mmproj_size_bytes: Option<u64>,
    /// Optional MTP draft GGUF URL. The shipped catalog does not list these; decode
    /// uses in-model MTP heads. Older installs may still have a file on disk.
    #[serde(default)]
    pub mtp_draft_url: Option<String>,
    #[serde(default)]
    pub mtp_draft_sha256: Option<String>,
    #[serde(default)]
    pub mtp_draft_size_bytes: Option<u64>,
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

    const LEGACY_V5_IDS: &[&str] = &["qwen3-8b-q4km"];

    const LEGACY_V7_IDS: &[&str] = &["qwen3-14b-q4km"];

    const LEGACY_V8_IDS: &[&str] = &["deepseek-r1-distill-qwen-7b-q4km", "hunyuan-mt-7b-q4km"];

    const LEGACY_V9_IDS: &[&str] = &[
        "phi-4-mini-instruct-q4km",
        "hy-mt15-7b-q4km",
        "qwen3.6-27b-q4km",
        "deepseek-r1-0528-qwen3-8b-q4km",
    ];

    /// Keep in sync with `src/lib/catalog-expectations.ts`.
    const EXPECTED_V11_MODELS: &[(&str, &str, u64)] = &[
        (
            "ministral-3-3b-instruct-q4km",
            "mistral3_instruct",
            2_146_498_528,
        ),
        ("qwen3.5-4b-q4km", "qwen2_instruct", 3_013_027_808),
        ("hy-mt2-7b-q4km", "hunyuan_dense", 4_624_648_896),
        ("gemma-4-e4b-it-q4km", "gemma4_it", 4_977_171_584),
        (
            "ministral-3-8b-instruct-q4km",
            "mistral3_instruct",
            5_198_387_456,
        ),
        (
            "eurollm-9b-instruct-2512-q4km",
            "eurollm_instruct",
            5_582_838_912,
        ),
        ("glm-4-9b-0414-q4km", "glm4_instruct", 6_166_574_464),
        ("qwen3.5-9b-q4km", "qwen2_instruct", 6_169_341_984),
        ("gemma-4-12b-it-q4km", "gemma4_it", 7_121_861_440),
        (
            "ministral-3-14b-instruct-q4km",
            "mistral3_instruct",
            8_239_068_576,
        ),
        ("gpt-oss-20b-q4km", "gpt_oss", 11_673_418_816),
        ("qwen3.8-27b-q4km", "qwen2_instruct", 16_464_440_224),
        ("muse-glimmer-30b-q4km", "muse_glimmer", 16_756_683_904),
        ("gemma-4-26b-a4b-it-q4km", "gemma4_it", 17_035_038_112),
        ("glm-4.7-flash-q4km", "glm47_flash", 18_474_983_296),
    ];

    #[test]
    fn bundled_catalog_is_version_11_with_fifteen_models() {
        let cat = load_catalog().expect("embedded catalog.json");
        assert_eq!(cat.version, 11);
        assert_eq!(cat.models.len(), 15);
    }

    #[test]
    fn catalog_omits_retired_ids() {
        let ids: Vec<String> = load_catalog()
            .expect("catalog")
            .models
            .into_iter()
            .map(|m| m.id)
            .collect();
        for group in [
            LEGACY_V4_IDS,
            LEGACY_V5_IDS,
            LEGACY_V7_IDS,
            LEGACY_V8_IDS,
            LEGACY_V9_IDS,
        ] {
            for legacy in group {
                assert!(
                    !ids.iter().any(|id| id == *legacy),
                    "legacy id still in catalog: {legacy}"
                );
            }
        }
    }

    #[test]
    fn catalog_v11_ids_and_templates() {
        for &(id, template, size_bytes) in EXPECTED_V11_MODELS {
            let model = find_catalog_model(id).unwrap_or_else(|_| panic!("{id}"));
            assert_eq!(model.chat_template, template, "{id}");
            assert_eq!(model.size_bytes, size_bytes, "{id}");
            assert!(!model.maker.trim().is_empty(), "{id} maker");
            assert!(!model.display_name.trim().is_empty(), "{id} display_name");
            assert!(!model.url.trim().is_empty(), "{id} url");
            assert!(!model.hf_repo.trim().is_empty(), "{id} hf_repo");
            assert!(!model.languages.is_empty(), "{id} languages");
            assert!(
                model.sha256.as_ref().is_some_and(|s| s.len() == 64),
                "{id} sha256"
            );
        }
    }

    #[test]
    fn gemma_4_12b_ships_mmproj_without_draft_sidecar() {
        let m = find_catalog_model("gemma-4-12b-it-q4km").expect("gemma");
        assert!(m.mmproj_url.as_ref().is_some_and(|u| u.contains("mmproj")));
        assert_eq!(m.mmproj_size_bytes, Some(175_115_840));
        assert!(m.mtp_draft_url.is_none());
        assert!(m.mtp_draft_sha256.is_none());
        assert!(m.mtp_draft_size_bytes.is_none());
    }

    #[test]
    fn catalog_v10_vision_models_omit_draft_sidecars() {
        for id in [
            "gemma-4-e4b-it-q4km",
            "gemma-4-12b-it-q4km",
            "qwen3.8-27b-q4km",
            "muse-glimmer-30b-q4km",
        ] {
            let model = find_catalog_model(id).unwrap_or_else(|_| panic!("{id}"));
            assert!(
                model
                    .mmproj_url
                    .as_ref()
                    .is_some_and(|u| u.contains("mmproj")),
                "{id}"
            );
            assert!(model.mtp_draft_url.is_none(), "{id}");
        }
    }

    #[test]
    fn catalog_size_order_when_sorted() {
        let mut models = load_catalog().expect("catalog").models;
        models.sort_by_key(|m| m.size_bytes);
        let ids: Vec<&str> = models.iter().map(|m| m.id.as_str()).collect();
        let expected: Vec<&str> = EXPECTED_V11_MODELS.iter().map(|(id, _, _)| *id).collect();
        assert_eq!(ids, expected);
    }
}
