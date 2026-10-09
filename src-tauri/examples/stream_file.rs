//! Test harness for the streaming recognizer: plays a 16 kHz mono 16-bit WAV
//! file into the same buffer the microphone would fill, in real time, and
//! prints every partial/final hypothesis as a JSON line on stdout.
//!
//!   cargo run --release --example stream_file -- <model.bin> <speech.wav> [prompt]
//!
//! Each line carries `wallMs`: when the hypothesis was produced relative to
//! playback start, which lets the alignment tests measure end-to-end lag.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use reflex_presenter_lib::speech::audio::{read_wav_16k, AudioBuffer, SAMPLE_RATE};
use reflex_presenter_lib::speech::engine::{self, EngineConfig, EngineEvent, Recognizer};
use whisper_rs::{WhisperContext, WhisperContextParameters};

fn main() -> anyhow::Result<()> {
    whisper_rs::install_logging_hooks();
    let args: Vec<String> = std::env::args().collect();
    anyhow::ensure!(args.len() >= 3, "usage: stream_file <model> <wav> [prompt]");
    let audio = read_wav_16k(std::path::Path::new(&args[2]))?;
    let prompt = Arc::new(Mutex::new(args.get(3).cloned().unwrap_or_default()));

    let load_start = Instant::now();
    let mut params = WhisperContextParameters::default();
    params.use_gpu(true);
    params.flash_attn = true;
    let ctx = Arc::new(WhisperContext::new_with_params(&args[1], params)?);
    let cfg = EngineConfig {
        window_ms: std::env::var("WINDOW_MS").ok().and_then(|v| v.parse().ok()).unwrap_or(6_000),
        step_ms: std::env::var("STEP_MS").ok().and_then(|v| v.parse().ok()).unwrap_or(300),
        fast_decode: std::env::var("FAST").map(|v| v != "0").unwrap_or(true),
        ..EngineConfig::default()
    };
    let mut recognizer = Recognizer::new(ctx)?;
    recognizer.warm_up(&cfg);
    eprintln!("model ready in {} ms", load_start.elapsed().as_millis());

    let buffer = Arc::new(Mutex::new(AudioBuffer::default()));
    let stop = Arc::new(AtomicBool::new(false));
    let start = Instant::now();

    // Feed audio in 20 ms chunks at real-time pace, then 1.5 s of silence so
    // the final pass runs.
    let feeder = {
        let buffer = buffer.clone();
        let stop = stop.clone();
        let mut audio = audio;
        audio.extend(std::iter::repeat_n(0.0, SAMPLE_RATE as usize * 3 / 2));
        std::thread::spawn(move || {
            let chunk = SAMPLE_RATE as usize / 50;
            for (i, part) in audio.chunks(chunk).enumerate() {
                buffer.lock().push(part);
                let due = Duration::from_millis(((i + 1) * 20) as u64);
                if let Some(wait) = due.checked_sub(start.elapsed()) {
                    std::thread::sleep(wait);
                }
            }
            std::thread::sleep(Duration::from_millis(500));
            stop.store(true, Ordering::Relaxed);
        })
    };

    engine::run(&mut recognizer, buffer, prompt, stop, cfg, |event| {
        if let EngineEvent::Transcript(t) = event {
            let mut value = serde_json::to_value(&t).unwrap();
            value["wallMs"] = serde_json::json!(start.elapsed().as_millis() as u64);
            println!("{value}");
        }
    });
    feeder.join().unwrap();
    Ok(())
}
