use futures_util::StreamExt;
use reqwest::Url;
use sha2::{Digest, Sha256};
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;

use crate::catalog::CatalogModel;
use crate::error::{MagunaError, MagunaResult};
use crate::paths;

pub async fn download_catalog_model(
    app: &tauri::AppHandle,
    model: &CatalogModel,
    on_progress: impl Fn(u64, Option<u64>) + Send + 'static,
) -> MagunaResult<std::path::PathBuf> {
    let tmp = paths::tmp_dir(app)?;
    fs::create_dir_all(&tmp).await?;
    let partial = tmp.join(format!("{}.partial", model.id));

    if partial.exists() {
        fs::remove_file(&partial).await?;
    }

    let url = Url::parse(&model.url).map_err(|e| MagunaError::Http(e.to_string()))?;
    let client = reqwest::Client::builder()
        .user_agent("Maguna/0.1 (local model download; +https://github.com/helvety/maguna)")
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

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| MagunaError::Http(e.to_string()))?;
        hasher.update(&chunk);
        file.write_all(&chunk).await?;
        received += chunk.len() as u64;
        on_progress(received, total);
    }
    file.flush().await?;

    if let Some(expected) = &model.sha256 {
        let digest = hasher.finalize();
        let hex = hex::encode(digest);
        if hex.to_lowercase() != expected.to_lowercase() {
            fs::remove_file(&partial).await.ok();
            return Err(MagunaError::msg("SHA256 mismatch — download corrupted"));
        }
    }

    Ok(partial)
}
