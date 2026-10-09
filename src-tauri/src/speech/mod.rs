//! Local speech recognition: microphone -> VAD -> whisper.cpp -> partial
//! transcripts, delivered to the UI as Tauri events:
//!
//! * `speech://status`     `{ state, message }`
//! * `speech://level`      `{ level, speaking }` (~20 Hz)
//! * `speech://transcript` partial / final hypotheses (see [`engine::Transcript`])
//! * `speech://model-download` download progress

pub mod audio;
pub mod engine;
pub mod models;
pub mod vad;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use whisper_rs::{WhisperContext, WhisperContextParameters};

use crate::error::{err, CmdResult};
use crate::storage::models_dir;
use audio::{AudioBuffer, CaptureShared};
use engine::{EngineConfig, EngineEvent, Recognizer};

#[derive(Default)]
pub struct SpeechState {
    session: Mutex<Option<Session>>,
    model: Mutex<Option<(PathBuf, Arc<WhisperContext>)>>,
    prompt: Arc<Mutex<String>>,
    downloads: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// Bumped by every start/stop so a slow start that has been superseded
    /// (e.g. the UI stopped while the model was loading) shuts itself down
    /// instead of leaving a capture session running.
    generation: AtomicU64,
}

struct Session {
    stop: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}

impl Session {
    fn shutdown(self) {
        self.stop.store(true, Ordering::Relaxed);
        for t in self.threads {
            let _ = t.join();
        }
    }
}

#[derive(Serialize, Clone)]
struct StatusEvent {
    state: &'static str,
    message: String,
}

#[derive(Serialize, Clone)]
struct LevelEvent {
    level: f32,
    speaking: bool,
}

fn emit_status(app: &AppHandle, state: &'static str, message: impl Into<String>) {
    let _ = app.emit("speech://status", StatusEvent { state, message: message.into() });
}

/// Load (or reuse) a whisper context. Loading takes a moment, so the last
/// model stays cached across start/stop.
fn load_model(state: &SpeechState, path: &PathBuf) -> anyhow::Result<Arc<WhisperContext>> {
    if let Some((cached, ctx)) = state.model.lock().as_ref() {
        if cached == path {
            return Ok(ctx.clone());
        }
    }
    let mut params = WhisperContextParameters::default();
    params.use_gpu(true);
    params.flash_attn = true;
    let ctx = Arc::new(WhisperContext::new_with_params(path, params)?);
    *state.model.lock() = Some((path.clone(), ctx.clone()));
    Ok(ctx)
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct StartOptions {
    model_id: String,
    device_id: Option<String>,
    language: Option<String>,
    step_ms: Option<u64>,
    window_ms: Option<u64>,
    silence_ms: Option<u64>,
    vad_sensitivity: Option<f32>,
    fast_decode: Option<bool>,
    use_prompt: Option<bool>,
    prompt: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartInfo {
    device: String,
    model: String,
}

#[tauri::command]
pub async fn speech_start(
    app: AppHandle,
    state: State<'_, SpeechState>,
    options: StartOptions,
) -> CmdResult<StartInfo> {
    let my_generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let previous = state.session.lock().take();
    if let Some(previous) = previous {
        tauri::async_runtime::spawn_blocking(move || previous.shutdown()).await?;
    }

    let dir = models_dir(&app)?;
    let Some(model_path) = models::resolve(&dir, &options.model_id) else {
        return err(format!("MODEL_MISSING:{}", options.model_id));
    };

    let mut cfg = EngineConfig::default();
    if let Some(v) = options.step_ms { cfg.step_ms = v.clamp(150, 2_000); }
    if let Some(v) = options.window_ms { cfg.window_ms = v.clamp(2_000, 20_000); }
    if let Some(v) = options.silence_ms { cfg.silence_ms = v.clamp(250, 3_000); }
    if let Some(v) = options.vad_sensitivity { cfg.vad_sensitivity = v; }
    if let Some(v) = options.fast_decode { cfg.fast_decode = v; }
    if let Some(v) = options.use_prompt { cfg.use_prompt = v; }
    let english_only = model_path.to_string_lossy().contains(".en");
    cfg.language = if english_only {
        "en".into()
    } else {
        options.language.clone().unwrap_or_else(|| "en".into())
    };
    *state.prompt.lock() = options.prompt.clone().unwrap_or_default();

    emit_status(&app, "loading", "Loading speech model…");
    let ctx = {
        let app = app.clone();
        let path = model_path.clone();
        tauri::async_runtime::spawn_blocking(move || {
            use tauri::Manager;
            load_model(&app.state::<SpeechState>(), &path)
        })
        .await?
    }
    .map_err(|e| format!("Could not load speech model: {e}"))?;

    let shared = CaptureShared {
        buffer: Arc::new(Mutex::new(AudioBuffer::default())),
        level: Arc::new(AtomicU32::new(0)),
    };
    let stop = Arc::new(AtomicBool::new(false));
    let dev_audio = std::env::var_os("REFLEX_DEV_AUDIO_FILE").filter(|_| cfg!(debug_assertions));
    let capture = match dev_audio {
        Some(file) => audio::start_file_capture(file.into(), &shared, stop.clone()),
        None => audio::start_capture(options.device_id.clone(), &shared, stop.clone()),
    };
    let (audio_thread, device_name) = capture
        .map_err(|e| {
            emit_status(&app, "error", e.to_string());
            format!("Microphone unavailable: {e}")
        })?;

    let speaking = Arc::new(AtomicBool::new(false));

    // Recognition worker.
    let worker = {
        let app = app.clone();
        let buffer = shared.buffer.clone();
        let prompt = state.prompt.clone();
        let stop = stop.clone();
        let speaking = speaking.clone();
        std::thread::Builder::new()
            .name("reflex-whisper".into())
            .spawn(move || {
                let mut recognizer = match Recognizer::new(ctx) {
                    Ok(r) => r,
                    Err(e) => {
                        emit_status(&app, "error", format!("Speech engine failed: {e}"));
                        return;
                    }
                };
                recognizer.warm_up(&cfg);
                if stop.load(Ordering::Relaxed) {
                    return;
                }
                emit_status(&app, "listening", "Listening");
                engine::run(&mut recognizer, buffer, prompt, stop, cfg, |event| match event {
                    EngineEvent::Transcript(t) => {
                        let _ = app.emit("speech://transcript", t);
                    }
                    EngineEvent::Speaking(s) => speaking.store(s, Ordering::Relaxed),
                });
            })?
    };

    // Level meter.
    let meter = {
        let app = app.clone();
        let level = shared.level.clone();
        let stop = stop.clone();
        std::thread::Builder::new().name("reflex-level".into()).spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                let value = f32::from_bits(level.load(Ordering::Relaxed));
                let _ = app.emit(
                    "speech://level",
                    LevelEvent { level: value, speaking: speaking.load(Ordering::Relaxed) },
                );
                std::thread::sleep(Duration::from_millis(50));
            }
        })?
    };

    let session = Session { stop, threads: vec![audio_thread, worker, meter] };
    if state.generation.load(Ordering::SeqCst) != my_generation {
        tauri::async_runtime::spawn_blocking(move || session.shutdown()).await?;
        return err("SUPERSEDED");
    }
    let replaced = state.session.lock().replace(session);
    if let Some(old) = replaced {
        tauri::async_runtime::spawn_blocking(move || old.shutdown()).await?;
    }

    Ok(StartInfo {
        device: device_name,
        model: model_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn speech_stop(app: AppHandle, state: State<'_, SpeechState>) -> CmdResult<()> {
    state.generation.fetch_add(1, Ordering::SeqCst);
    let session = state.session.lock().take();
    if let Some(session) = session {
        tauri::async_runtime::spawn_blocking(move || session.shutdown()).await?;
    }
    emit_status(&app, "stopped", "Stopped");
    Ok(())
}

#[tauri::command]
pub fn speech_is_running(state: State<'_, SpeechState>) -> bool {
    state.session.lock().is_some()
}

/// Update the recognition prompt (recent script context) while running.
#[tauri::command]
pub fn speech_set_prompt(state: State<'_, SpeechState>, prompt: String) {
    *state.prompt.lock() = prompt;
}

#[tauri::command]
pub fn speech_list_devices() -> CmdResult<Vec<audio::InputDevice>> {
    Ok(audio::list_input_devices()?)
}

#[tauri::command]
pub fn speech_list_models(app: AppHandle) -> CmdResult<Vec<models::ModelInfo>> {
    Ok(models::list(&models_dir(&app)?))
}

#[tauri::command]
pub fn speech_download_model(app: AppHandle, state: State<'_, SpeechState>, id: String) -> CmdResult<()> {
    let dir = models_dir(&app)?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut downloads = state.downloads.lock();
        if downloads.contains_key(&id) {
            return Ok(());
        }
        downloads.insert(id.clone(), cancel.clone());
    }
    std::thread::spawn(move || {
        let report = |p: models::DownloadProgress| {
            let _ = app.emit("speech://model-download", p);
        };
        if let Err(e) = models::download(&dir, &id, cancel, report) {
            let _ = app.emit(
                "speech://model-download",
                models::DownloadProgress { id: id.clone(), downloaded: 0, total: 0, done: true, error: Some(e.to_string()) },
            );
        }
        use tauri::Manager;
        app.state::<SpeechState>().downloads.lock().remove(&id);
    });
    Ok(())
}

#[tauri::command]
pub fn speech_cancel_download(state: State<'_, SpeechState>, id: String) {
    if let Some(flag) = state.downloads.lock().get(&id) {
        flag.store(true, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn speech_import_model(app: AppHandle, path: String) -> CmdResult<models::ModelInfo> {
    let src = PathBuf::from(&path);
    if !models::looks_like_model(&src) {
        return err("That file is not a whisper.cpp (ggml) model.");
    }
    let name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("invalid file name")?
        .to_string();
    let name = if name.ends_with(".bin") { name } else { format!("{name}.bin") };
    let dir = models_dir(&app)?;
    std::fs::copy(&src, dir.join(&name))?;
    models::list(&dir)
        .into_iter()
        .find(|m| m.file == name)
        .ok_or_else(|| "import failed".into())
}

#[tauri::command]
pub fn speech_delete_model(app: AppHandle, state: State<'_, SpeechState>, id: String) -> CmdResult<()> {
    let dir = models_dir(&app)?;
    if let Some(path) = models::resolve(&dir, &id) {
        let mut cached = state.model.lock();
        if cached.as_ref().is_some_and(|(p, _)| *p == path) {
            *cached = None;
        }
        std::fs::remove_file(path)?;
    }
    Ok(())
}

/// Stop capture when the app exits.
pub fn shutdown(state: &SpeechState) {
    if let Some(session) = state.session.lock().take() {
        session.shutdown();
    }
}
