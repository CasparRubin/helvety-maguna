use futures_util::StreamExt;
use reqwest::Url;
use sha2::{Digest, Sha256};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;

use std::path::{Path, PathBuf};

use crate::catalog::CatalogModel;
use crate::error::{MagunaError, MagunaResult};
use crate::paths;

async fn remove_partial_file(path: &Path) {
    let _ = fs::remove_file(path).await;
}

/// Download any HTTPS URL into `maguna/tmp/<staging_name>`, optionally verifying SHA256.
pub async fn download_url_to_tmp(
    app: &tauri::AppHandle,
    url: &str,
    staging_name: &str,
    expected_sha256: Option<&str>,
    on_progress: impl Fn(u64, Option<u64>) + Send + 'static,
) -> MagunaResult<PathBuf> {
    let tmp = paths::tmp_dir(app)?;
    fs::create_dir_all(&tmp).await?;
    let partial = tmp.join(staging_name);

    if partial.exists() {
        fs::remove_file(&partial).await?;
    }

    let url = Url::parse(url).map_err(|e| MagunaError::Http(e.to_string()))?;
    let client = reqwest::Client::builder()
        .user_agent(concat!(
            "Maguna/",
            env!("CARGO_PKG_VERSION"),
            " (local model download; +https://github.com/helvety/maguna)"
        ))
        .build()
        .map_err(|e| MagunaError::Http(e.to_string()))?;

    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| MagunaError::Http(e.to_string()))?;

    if !res.status().is_success() {
        return Err(MagunaError::Http(format!(
            "unexpected status {}",
            res.status()
        )));
    }

    let total = res.content_length();
    let mut received: u64 = 0;
    let mut file = File::create(&partial).await?;
    let mut hasher = Sha256::new();
    let mut stream = res.bytes_stream();

    let write_result: MagunaResult<()> = async {
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| MagunaError::Http(e.to_string()))?;
            hasher.update(&chunk);
            file.write_all(&chunk).await?;
            received += chunk.len() as u64;
            on_progress(received, total);
        }
        file.flush().await?;
        Ok(())
    }
    .await;

    if let Err(e) = write_result {
        remove_partial_file(&partial).await;
        return Err(e);
    }

    if let Some(expected) = expected_sha256 {
        let digest = hasher.finalize();
        let hex = hex::encode(digest);
        if hex.to_lowercase() != expected.to_lowercase() {
            remove_partial_file(&partial).await;
            return Err(MagunaError::msg("SHA256 mismatch — download corrupted"));
        }
    }

    Ok(partial)
}

pub async fn download_catalog_model(
    app: &tauri::AppHandle,
    model: &CatalogModel,
    on_progress: impl Fn(u64, Option<u64>) + Send + 'static,
) -> MagunaResult<PathBuf> {
    download_url_to_tmp(
        app,
        &model.url,
        &paths::catalog_download_partial_filename(&model.id),
        model.sha256.as_deref(),
        on_progress,
    )
    .await
}
