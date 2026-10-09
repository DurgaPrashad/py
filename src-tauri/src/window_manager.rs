//! Presenter window management: fullscreen and a second "audience" window
//! that shows only the slides, typically on a projector or external display,
//! while the main window keeps the private presenter view.
//!
//! These are ordinary, visible OS windows. There is deliberately no attempt
//! to hide anything from screen sharing or capture.

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::{err, CmdResult};

pub const AUDIENCE_LABEL: &str = "audience";
/// Shown in meeting apps' "share window" pickers.
pub const AUDIENCE_TITLE: &str = "Reflex — Slides (share this window)";
const MAIN_TITLE: &str = "Reflex Presenter";
const COMPACT_TITLE: &str = "Reflex — Teleprompter (don't share)";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    index: usize,
    name: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    scale_factor: f64,
    is_current: bool,
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> CmdResult<Vec<MonitorInfo>> {
    let Some(main) = app.get_webview_window("main") else {
        return err("main window not found");
    };
    let current = main.current_monitor()?.map(|m| (m.position().x, m.position().y));
    let monitors = main.available_monitors()?;
    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, m)| MonitorInfo {
            index,
            name: m.name().cloned().unwrap_or_else(|| format!("Display {}", index + 1)),
            width: m.size().width,
            height: m.size().height,
            x: m.position().x,
            y: m.position().y,
            scale_factor: m.scale_factor(),
            is_current: current == Some((m.position().x, m.position().y)),
        })
        .collect())
}

/// Fullscreen for the presenter window. On macOS this uses "simple"
/// fullscreen, which keeps the window in the current Space: native
/// fullscreen moves it to a separate Space, which Zoom / Meet / Teams often
/// capture as a blank window when sharing.
#[tauri::command]
pub fn set_main_fullscreen(app: AppHandle, fullscreen: bool) -> CmdResult<()> {
    if let Some(main) = app.get_webview_window("main") {
        main.set_simple_fullscreen(fullscreen)?;
        set_window_buttons_hidden(&main, fullscreen);
    }
    Ok(())
}

/// The overlay title bar keeps the traffic-light buttons on screen in
/// simple fullscreen; hide them while presenting.
#[cfg(target_os = "macos")]
fn set_window_buttons_hidden(window: &tauri::WebviewWindow, hidden: bool) {
    use objc2_app_kit::{NSWindow, NSWindowButton};
    let apply = move |w: tauri::WebviewWindow| {
        let target = w.clone();
        let _ = w.run_on_main_thread(move || {
            let Ok(ptr) = target.ns_window() else { return };
            // SAFETY: tao hands out a valid NSWindow pointer for this window.
            let ns_window = unsafe { &*(ptr as *const NSWindow) };
            for kind in [NSWindowButton::CloseButton, NSWindowButton::MiniaturizeButton, NSWindowButton::ZoomButton] {
                if let Some(button) = ns_window.standardWindowButton(kind) {
                    button.setHidden(hidden);
                }
            }
        });
    };
    apply(window.clone());
    // The window's style mask is restored asynchronously, which can bring the
    // buttons back; apply once more after it settles.
    let w = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(350));
        apply(w);
    });
}

#[cfg(not(target_os = "macos"))]
fn set_window_buttons_hidden(_window: &tauri::WebviewWindow, _hidden: bool) {}

#[tauri::command]
pub fn is_main_fullscreen(app: AppHandle) -> CmdResult<bool> {
    match app.get_webview_window("main") {
        Some(main) => Ok(main.is_fullscreen()?),
        None => Ok(false),
    }
}

/// Presenter window frame saved while it is shrunk to the floating strip.
#[derive(Default)]
pub struct CompactState(parking_lot::Mutex<Option<(tauri::PhysicalPosition<i32>, tauri::PhysicalSize<u32>)>>);

/// Screen-share mode on desktop: the presenter window becomes a floating,
/// always-on-top strip directly under the camera (the slides window, which is
/// what gets shared, fills the screen behind it). `compact: false` restores it.
#[tauri::command]
pub async fn set_presenter_compact(
    app: AppHandle,
    state: tauri::State<'_, CompactState>,
    compact: bool,
    width: f64,
    height: f64,
) -> CmdResult<()> {
    let Some(main) = app.get_webview_window("main") else {
        return err("main window not found");
    };
    if compact {
        {
            let mut saved = state.0.lock();
            if saved.is_none() {
                *saved = Some((main.outer_position()?, main.inner_size()?));
            }
        }
        let Some(monitor) = main.current_monitor()? else {
            return err("no display");
        };
        let scale = monitor.scale_factor();
        let mpos = monitor.position();
        let mw = monitor.size().width as f64 / scale;
        let notch = notch_height(&main);
        let width = width.clamp(320.0, mw - 16.0);
        main.set_min_size(None::<tauri::LogicalSize<f64>>)?;
        main.set_size(tauri::LogicalSize::new(width, height.max(56.0)))?;
        main.set_position(tauri::LogicalPosition::new(
            mpos.x as f64 / scale + (mw - width) / 2.0,
            mpos.y as f64 / scale + notch.max(0.0) + 4.0,
        ))?;
        main.set_always_on_top(true)?;
        main.set_title(COMPACT_TITLE)?;
        set_window_buttons_hidden(&main, true);
        let _ = main.set_focus();
    } else {
        main.set_always_on_top(false)?;
        main.set_title(MAIN_TITLE)?;
        set_window_buttons_hidden(&main, false);
        main.set_min_size(Some(tauri::LogicalSize::new(960.0, 620.0)))?;
        if let Some((pos, size)) = state.0.lock().take() {
            main.set_size(size)?;
            main.set_position(pos)?;
        }
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraAnchor {
    /// Horizontal centre of the display (where a laptop / monitor camera
    /// sits), in CSS pixels from the presenter window's left edge.
    center_x: f64,
    /// First row below the camera housing / notch, in CSS pixels from the
    /// window's top edge (0 when the window starts below it).
    top: f64,
    /// Height of the notch area on this display (0 without a notch).
    notch: f64,
}

/// Where to put the teleprompter so the presenter reads right under the
/// camera: top-centre of the display, below the notch on MacBooks.
#[tauri::command]
pub async fn camera_anchor(app: AppHandle) -> CmdResult<CameraAnchor> {
    let Some(main) = app.get_webview_window("main") else {
        return err("main window not found");
    };
    let Some(monitor) = main.current_monitor()? else {
        return err("no display");
    };
    let scale = monitor.scale_factor();
    let inner = main.inner_position()?;
    let mpos = monitor.position();
    let msize = monitor.size();
    let notch = notch_height(&main);
    let screen_top = (mpos.y - inner.y) as f64 / scale;
    Ok(CameraAnchor {
        center_x: ((mpos.x as f64 + msize.width as f64 / 2.0) - inner.x as f64) / scale,
        top: (screen_top + notch).max(0.0),
        notch,
    })
}

/// Height of the camera housing at the top of the window's screen (points).
#[cfg(target_os = "macos")]
fn notch_height(window: &tauri::WebviewWindow) -> f64 {
    use objc2_app_kit::NSWindow;
    let (tx, rx) = std::sync::mpsc::channel();
    let w = window.clone();
    let scheduled = window.run_on_main_thread(move || {
        let top = w
            .ns_window()
            .ok()
            .and_then(|ptr| {
                // SAFETY: tao hands out a valid NSWindow pointer for this window.
                let ns_window = unsafe { &*(ptr as *const NSWindow) };
                ns_window.screen()
            })
            .map(|screen| screen.safeAreaInsets().top)
            .unwrap_or(0.0);
        let _ = tx.send(top);
    });
    if scheduled.is_err() {
        return 0.0;
    }
    rx.recv_timeout(std::time::Duration::from_secs(1)).unwrap_or(0.0)
}

#[cfg(not(target_os = "macos"))]
fn notch_height(_window: &tauri::WebviewWindow) -> f64 {
    0.0
}

/// Open (or reconfigure) the slides-only window.
///
/// * `share: true` — a normal window on the presenter's display, meant to be
///   picked in a meeting app's "share window" dialog. The presenter window
///   with the teleprompter stays separate; the user simply doesn't share it.
/// * `share: false` — second-display mode: the window fills another display
///   (projector / external monitor) when one is available.
///
/// Returns true when the slides went fullscreen on another display.
#[tauri::command]
pub async fn open_audience_window(
    app: AppHandle,
    project_id: String,
    monitor_index: Option<usize>,
    share: Option<bool>,
) -> CmdResult<bool> {
    if !project_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return err("invalid project id");
    }
    let share = share.unwrap_or(false);
    let Some(main) = app.get_webview_window("main") else {
        return err("main window not found");
    };
    let monitors = main.available_monitors()?;
    let current = main.current_monitor()?;
    let target = if share {
        current.clone()
    } else {
        monitor_index.and_then(|i| monitors.get(i).cloned()).or_else(|| {
            // Default: the first display that is not the presenter's.
            monitors
                .iter()
                .find(|m| current.as_ref().map(|c| c.position() != m.position()).unwrap_or(true))
                .cloned()
        })
    };
    let on_other_display = match (&target, &current) {
        (Some(t), Some(c)) => t.position() != c.position(),
        (Some(_), None) => true,
        _ => false,
    };

    let window = match app.get_webview_window(AUDIENCE_LABEL) {
        Some(existing) => existing,
        None => {
            let url = WebviewUrl::App(format!("index.html#/audience/{project_id}").into());
            WebviewWindowBuilder::new(&app, AUDIENCE_LABEL, url)
                .title(AUDIENCE_TITLE)
                .inner_size(1280.0, 720.0)
                .min_inner_size(480.0, 270.0)
                .background_color(tauri::window::Color(0, 0, 0, 255))
                .visible(false)
                .build()?
        }
    };
    window.set_simple_fullscreen(false)?;

    if let Some(monitor) = &target {
        let scale = monitor.scale_factor();
        let pos = monitor.position();
        let size = monitor.size();
        let (mw, mh) = (size.width as f64 / scale, size.height as f64 / scale);
        if share {
            // Fills the presenter's display; the teleprompter floats above it.
            window.set_position(tauri::LogicalPosition::new(pos.x as f64 / scale + 40.0, pos.y as f64 / scale + 40.0))?;
            window.set_size(tauri::LogicalSize::new(mw - 80.0, mh - 80.0))?;
        } else {
            window.set_position(tauri::LogicalPosition::new(pos.x as f64 / scale + 40.0, pos.y as f64 / scale + 40.0))?;
            if on_other_display {
                window.set_size(tauri::LogicalSize::new(mw - 80.0, mh - 80.0))?;
            }
        }
    }
    window.show()?;
    if share || on_other_display {
        window.set_simple_fullscreen(true)?;
    }
    log::info!("slides window open (share: {share}, other display: {on_other_display})");
    // Keep keyboard focus with the presenter.
    let _ = main.set_focus();
    Ok(on_other_display && !share)
}

#[tauri::command]
pub fn close_audience_window(app: AppHandle) -> CmdResult<()> {
    if let Some(window) = app.get_webview_window(AUDIENCE_LABEL) {
        window.close()?;
    }
    Ok(())
}

/// Open the OS page where the user allows meeting apps (Zoom, Chrome, Teams)
/// to capture the screen. Without that permission macOS hands those apps a
/// blank picture of other apps' windows.
#[tauri::command]
pub fn open_screen_recording_settings() -> CmdResult<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn()?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        err("Screen recording permission is only required on macOS.")
    }
}
