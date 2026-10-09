//! Development diagnostic: capture one of our own windows through the same
//! macOS window-capture path screen-sharing apps use, and report whether the
//! image has real content. An app may capture its own windows without the
//! Screen Recording permission, so this works without any prompt.

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{err, CmdResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStats {
    width: usize,
    height: usize,
    /// Share of sampled pixels that are not near-black.
    non_black: f64,
    /// Share of sampled pixels that are near-white (slide paper).
    white: f64,
    distinct_colors: usize,
}

#[cfg(target_os = "macos")]
mod ffi {
    use std::ffi::c_void;

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct CGPoint {
        pub x: f64,
        pub y: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct CGSize {
        pub width: f64,
        pub height: f64,
    }
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct CGRect {
        pub origin: CGPoint,
        pub size: CGSize,
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        pub static CGRectNull: CGRect;
        pub fn CGWindowListCreateImage(rect: CGRect, list: u32, window: u32, image: u32) -> *mut c_void;
        pub fn CGImageGetWidth(img: *mut c_void) -> usize;
        pub fn CGImageGetHeight(img: *mut c_void) -> usize;
        pub fn CGImageGetBytesPerRow(img: *mut c_void) -> usize;
        pub fn CGImageGetBitsPerPixel(img: *mut c_void) -> usize;
        pub fn CGImageGetDataProvider(img: *mut c_void) -> *mut c_void;
        pub fn CGDataProviderCopyData(provider: *mut c_void) -> *mut c_void;
        pub fn CGImageRelease(img: *mut c_void);
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        pub fn CFDataGetBytePtr(data: *mut c_void) -> *const u8;
        pub fn CFDataGetLength(data: *mut c_void) -> isize;
        pub fn CFRelease(obj: *mut c_void);
    }

    pub const INCLUDING_WINDOW: u32 = 1 << 3;
    pub const BOUNDS_IGNORE_FRAMING: u32 = 1 << 0;
    pub const NOMINAL_RESOLUTION: u32 = 1 << 4;
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn dev_capture_window(app: AppHandle, label: String, save_path: Option<String>) -> CmdResult<CaptureStats> {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    let Some(window) = app.get_webview_window(&label) else {
        return err(format!("no window {label}"));
    };
    let (tx, rx) = std::sync::mpsc::channel();
    let w = window.clone();
    window.run_on_main_thread(move || {
        let number = w.ns_window().map(|ptr| {
            let obj = ptr as *mut AnyObject;
            let n: isize = unsafe { msg_send![&*obj, windowNumber] };
            n as u32
        });
        let _ = tx.send(number);
    })?;
    let number = rx.recv().map_err(|e| e.to_string())??;

    unsafe {
        let img = ffi::CGWindowListCreateImage(
            ffi::CGRectNull,
            ffi::INCLUDING_WINDOW,
            number,
            ffi::BOUNDS_IGNORE_FRAMING | ffi::NOMINAL_RESOLUTION,
        );
        if img.is_null() {
            return err("window capture returned no image");
        }
        let width = ffi::CGImageGetWidth(img);
        let height = ffi::CGImageGetHeight(img);
        let row = ffi::CGImageGetBytesPerRow(img);
        let bpp = ffi::CGImageGetBitsPerPixel(img) / 8;
        let data = ffi::CGDataProviderCopyData(ffi::CGImageGetDataProvider(img));
        let bytes = std::slice::from_raw_parts(ffi::CFDataGetBytePtr(data), ffi::CFDataGetLength(data) as usize);

        let (mut total, mut non_black, mut white) = (0usize, 0usize, 0usize);
        let mut colors = std::collections::HashSet::new();
        let step = (width.max(height) / 200).max(1);
        for y in (0..height).step_by(step) {
            for x in (0..width).step_by(step) {
                let i = y * row + x * bpp;
                if i + 2 >= bytes.len() {
                    continue;
                }
                let (b, g, r) = (bytes[i] as u32, bytes[i + 1] as u32, bytes[i + 2] as u32);
                total += 1;
                if r + g + b > 60 {
                    non_black += 1;
                }
                if r > 230 && g > 230 && b > 230 {
                    white += 1;
                }
                colors.insert((r >> 4, g >> 4, b >> 4));
            }
        }
        if let Some(path) = save_path.filter(|_| bpp == 4) {
            write_bmp(&path, width, height, row, bytes)?;
        }
        ffi::CFRelease(data);
        ffi::CGImageRelease(img);
        let total = total.max(1) as f64;
        Ok(CaptureStats {
            width,
            height,
            non_black: non_black as f64 / total,
            white: white as f64 / total,
            distinct_colors: colors.len(),
        })
    }
}

/// Minimal 32-bit top-down BMP writer for BGRA pixels (macOS window images).
#[cfg(target_os = "macos")]
fn write_bmp(path: &str, width: usize, height: usize, row: usize, bytes: &[u8]) -> CmdResult<()> {
    let pixels = width * height * 4;
    let mut out = Vec::with_capacity(54 + pixels);
    out.extend_from_slice(b"BM");
    out.extend_from_slice(&((54 + pixels) as u32).to_le_bytes());
    out.extend_from_slice(&[0; 4]);
    out.extend_from_slice(&54u32.to_le_bytes());
    out.extend_from_slice(&40u32.to_le_bytes());
    out.extend_from_slice(&(width as i32).to_le_bytes());
    out.extend_from_slice(&(-(height as i32)).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&[0; 24]);
    for y in 0..height {
        out.extend_from_slice(&bytes[y * row..y * row + width * 4]);
    }
    std::fs::write(path, out)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn dev_capture_window(_app: AppHandle, _label: String, _save_path: Option<String>) -> CmdResult<CaptureStats> {
    err("window capture diagnostic is macOS only")
}
