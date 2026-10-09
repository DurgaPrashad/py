//! Optional high-fidelity slide rendering through a locally installed
//! LibreOffice: PPT/PPTX are converted to PDF offline, then rendered by the
//! regular PDF pipeline. Nothing here touches the network.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub fn find_soffice() -> Option<PathBuf> {
    let candidates: &[&str] = &[
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/opt/homebrew/bin/soffice",
        "/usr/local/bin/soffice",
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
        "/snap/bin/libreoffice",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ];
    if let Some(found) = candidates.iter().map(PathBuf::from).find(|p| p.is_file()) {
        return Some(found);
    }
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .flat_map(|dir| ["soffice", "libreoffice", "soffice.exe"].map(|n| dir.join(n)))
        .find(|p| p.is_file())
}

/// Convert `input` to PDF inside `out_dir`, returning the PDF path.
pub fn convert_to_pdf(input: &Path, out_dir: &Path) -> anyhow::Result<PathBuf> {
    let soffice = find_soffice().ok_or_else(|| anyhow::anyhow!("LibreOffice is not installed"))?;
    std::fs::create_dir_all(out_dir)?;

    // A private profile avoids clashing with a LibreOffice window the user
    // already has open (soffice would otherwise hand off and exit early).
    let profile = std::env::temp_dir().join("reflex-presenter-lo-profile");
    let profile_url = format!("file://{}", profile.to_string_lossy().replace('\\', "/"));

    let mut child = Command::new(soffice)
        .arg(format!("-env:UserInstallation={profile_url}"))
        .args(["--headless", "--norestore", "--convert-to", "pdf", "--outdir"])
        .arg(out_dir)
        .arg(input)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;

    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            if !status.success() {
                anyhow::bail!("LibreOffice conversion failed ({status})");
            }
            break;
        }
        if started.elapsed() > Duration::from_secs(180) {
            let _ = child.kill();
            anyhow::bail!("LibreOffice conversion timed out");
        }
        std::thread::sleep(Duration::from_millis(150));
    }

    let stem = input
        .file_stem()
        .ok_or_else(|| anyhow::anyhow!("invalid input file name"))?;
    let pdf = out_dir.join(stem).with_extension("pdf");
    if !pdf.is_file() {
        anyhow::bail!("LibreOffice did not produce a PDF");
    }
    Ok(pdf)
}
