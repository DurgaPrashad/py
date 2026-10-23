mod capture_check;
mod document_parser;
mod error;
pub mod speech;
mod storage;
mod window_manager;

use tauri::{Emitter, Manager, RunEvent, WindowEvent};

/// Development aid: frontend errors are mirrored into the terminal log.
#[tauri::command]
fn frontend_log(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!(target: "webview", "{message}"),
        "warn" => log::warn!(target: "webview", "{message}"),
        _ => log::info!(target: "webview", "{message}"),
    }
}

/// Development aid: a file the frontend self-test should import end to end
/// (set `REFLEX_SELFTEST_FILE`). Always `None` in release builds.
#[tauri::command]
fn dev_selftest_file() -> Option<String> {
    if cfg!(debug_assertions) { std::env::var("REFLEX_SELFTEST_FILE").ok() } else { None }
}

/// Development aid: folder for self-test window captures (`REFLEX_SELFTEST_SHOTS`).
#[tauri::command]
fn dev_selftest_shots() -> Option<String> {
    if cfg!(debug_assertions) { std::env::var("REFLEX_SELFTEST_SHOTS").ok() } else { None }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Route whisper.cpp / ggml logging away from stderr.
    whisper_rs::install_logging_hooks();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(if cfg!(debug_assertions) { log::LevelFilter::Info } else { log::LevelFilter::Warn })
                .build(),
        )
        .manage(speech::SpeechState::default())
        .manage(window_manager::CompactState::default())
        .invoke_handler(tauri::generate_handler![
            frontend_log,
            dev_selftest_file,
            dev_selftest_shots,
            capture_check::dev_capture_window,
            storage::app_paths,
            storage::storage_list_projects,
            storage::storage_load_project,
            storage::storage_save_project,
            storage::storage_delete_project,
            storage::storage_import_source,
            storage::storage_write_asset,
            storage::storage_load_settings,
            storage::storage_save_settings,
            storage::read_file_bytes,
            document_parser::parse_ppt_legacy,
            document_parser::office_converter_path,
            document_parser::office_convert_to_pdf,
            speech::speech_start,
            speech::speech_stop,
            speech::speech_is_running,
            speech::speech_set_prompt,
            speech::speech_list_devices,
            speech::speech_list_models,
            speech::speech_download_model,
            speech::speech_cancel_download,
            speech::speech_import_model,
            speech::speech_delete_model,
            window_manager::list_monitors,
            window_manager::set_main_fullscreen,
            window_manager::is_main_fullscreen,
            window_manager::open_audience_window,
            window_manager::close_audience_window,
            window_manager::open_screen_recording_settings,
            window_manager::open_external,
            window_manager::camera_anchor,
            window_manager::set_presenter_compact,
        ])
        .on_window_event(|window, event| {
            // Let the presenter know when the slides window goes away (the
            // user may close it themselves).
            if window.label() == window_manager::AUDIENCE_LABEL {
                if let WindowEvent::Destroyed = event {
                    let _ = window.app_handle().emit("present://audience-closed", ());
                }
            }
            // Closing the presenter window closes the audience window too.
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { .. } = event {
                    if let Some(audience) = window.app_handle().get_webview_window(window_manager::AUDIENCE_LABEL) {
                        let _ = audience.close();
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Reflex Presenter");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            speech::shutdown(&handle.state::<speech::SpeechState>());
        }
    });
}
