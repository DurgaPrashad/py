//! Whisper model management. Models are plain ggml files in the app's
//! `models/` directory. Downloading is a one-time, user-initiated action;
//! users can also import a model file they already have, fully offline.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use serde::Serialize;

pub struct ModelSpec {
    pub id: &'static str,
    pub file: &'static str,
    pub label: &'static str,
    pub size_mb: u32,
    pub english_only: bool,
    pub description: &'static str,
}

pub const CATALOG: &[ModelSpec] = &[
    ModelSpec {
        id: "tiny.en",
        file: "ggml-tiny.en.bin",
        label: "Tiny · English",
        size_mb: 75,
        english_only: true,
        description: "Fastest. Good on older or battery-constrained machines.",
    },
    ModelSpec {
        id: "base.en",
        file: "ggml-base.en.bin",
        label: "Base · English",
        size_mb: 142,
        english_only: true,
        description: "Recommended. Best balance of speed and accuracy.",
    },
    ModelSpec {
        id: "small.en",
        file: "ggml-small.en.bin",
        label: "Small · English",
        size_mb: 466,
        english_only: true,
        description: "More accurate. Needs a recent, fast machine.",
    },
    ModelSpec {
        id: "base",
        file: "ggml-base.bin",
        label: "Base · Multilingual",
        size_mb: 142,
        english_only: false,
        description: "For presenting in languages other than English.",
    },
    ModelSpec {
        id: "small",
        file: "ggml-small.bin",
        label: "Small · Multilingual",
        size_mb: 466,
        english_only: false,
        description: "More accurate multilingual recognition.",
    },
    ModelSpec {
        id: "large-v3-turbo-q5_0",
        file: "ggml-large-v3-turbo-q5_0.bin",
        label: "Large v3 Turbo · Multilingual",
        size_mb: 547,
        english_only: false,
        description: "Highest accuracy. Apple Silicon or a GPU recommended.",
    },
];

const DOWNLOAD_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
    pub file: String,
    pub size_mb: u32,
    pub english_only: bool,
    pub description: String,
    pub installed: bool,
    pub custom: bool,
    pub path: String,
}

/// Every whisper ggml file starts with the magic 0x67676d6c ("ggml"), stored
/// little-endian.
pub fn looks_like_model(path: &Path) -> bool {
    let mut magic = [0u8; 4];
    fs::File::open(path)
        .and_then(|mut f| f.read_exact(&mut magic))
        .map(|_| u32::from_le_bytes(magic) == 0x6767_6d6c)
        .unwrap_or(false)
}

pub fn list(dir: &Path) -> Vec<ModelInfo> {
    let mut out: Vec<ModelInfo> = CATALOG
        .iter()
        .map(|m| {
            let path = dir.join(m.file);
            ModelInfo {
                id: m.id.into(),
                label: m.label.into(),
                file: m.file.into(),
                size_mb: m.size_mb,
                english_only: m.english_only,
                description: m.description.into(),
                installed: path.is_file(),
                custom: false,
                path: path.to_string_lossy().into_owned(),
            }
        })
        .collect();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else { continue };
            if !name.ends_with(".bin") || CATALOG.iter().any(|m| m.file == name) {
                continue;
            }
            let size_mb = entry.metadata().map(|m| (m.len() / 1_000_000) as u32).unwrap_or(0);
            out.push(ModelInfo {
                id: name.into(),
                label: name.trim_start_matches("ggml-").trim_end_matches(".bin").into(),
                file: name.into(),
                size_mb,
                english_only: name.contains(".en"),
                description: "Imported model".into(),
                installed: true,
                custom: true,
                path: path.to_string_lossy().into_owned(),
            });
        }
    }
    out
}

pub fn resolve(dir: &Path, id: &str) -> Option<PathBuf> {
    let file = CATALOG
        .iter()
        .find(|m| m.id == id)
        .map(|m| m.file.to_string())
        .unwrap_or_else(|| id.to_string());
    if file.contains('/') || file.contains('\\') || file.contains("..") {
        return None;
    }
    let path = dir.join(file);
    path.is_file().then_some(path)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub downloaded: u64,
    pub total: u64,
    pub done: bool,
    pub error: Option<String>,
}

pub fn download(
    dir: &Path,
    id: &str,
    cancel: Arc<AtomicBool>,
    mut progress: impl FnMut(DownloadProgress),
) -> anyhow::Result<PathBuf> {
    let spec = CATALOG
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| anyhow::anyhow!("unknown model {id}"))?;
    let url = format!("{DOWNLOAD_BASE}/{}", spec.file);
    let dest = dir.join(spec.file);
    let part = dir.join(format!("{}.part", spec.file));

    let response = ureq::get(&url).call()?;
    let body = response.into_body();
    let total = body.content_length().unwrap_or(spec.size_mb as u64 * 1_000_000);
    let mut reader = body.into_reader();
    let mut file = fs::File::create(&part)?;
    let mut buf = vec![0u8; 256 * 1024];
    let mut downloaded = 0u64;
    let mut last_report = Instant::now();

    loop {
        if cancel.load(Ordering::Relaxed) {
            drop(file);
            let _ = fs::remove_file(&part);
            anyhow::bail!("download cancelled");
        }
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n])?;
        downloaded += n as u64;
        if last_report.elapsed().as_millis() > 200 {
            last_report = Instant::now();
            progress(DownloadProgress { id: id.into(), downloaded, total, done: false, error: None });
        }
    }
    file.sync_all()?;
    drop(file);

    if !looks_like_model(&part) {
        let _ = fs::remove_file(&part);
        anyhow::bail!("downloaded file is not a valid Whisper model");
    }
    fs::rename(&part, &dest)?;
    progress(DownloadProgress { id: id.into(), downloaded, total, done: true, error: None });
    Ok(dest)
}
