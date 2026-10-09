//! Native helpers for presentation import. PDF rendering and PPTX XML parsing
//! run in the frontend (pdf.js / DOMParser); the native side handles what the
//! webview cannot: legacy binary .ppt and office-suite conversion.

mod office;
mod ppt;

use std::path::PathBuf;

use crate::error::CmdResult;

pub use ppt::PptSlide;

#[tauri::command]
pub async fn parse_ppt_legacy(path: String) -> CmdResult<Vec<PptSlide>> {
    let path = PathBuf::from(path);
    let slides = tauri::async_runtime::spawn_blocking(move || ppt::extract(&path)).await??;
    Ok(slides)
}

/// Path to a local LibreOffice binary, if one is installed.
#[tauri::command]
pub fn office_converter_path() -> Option<String> {
    office::find_soffice().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn office_convert_to_pdf(path: String, out_dir: String) -> CmdResult<String> {
    let input = PathBuf::from(path);
    let out = PathBuf::from(out_dir);
    let pdf = tauri::async_runtime::spawn_blocking(move || office::convert_to_pdf(&input, &out))
        .await??;
    Ok(pdf.to_string_lossy().into_owned())
}
