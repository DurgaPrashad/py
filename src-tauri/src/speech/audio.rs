//! Microphone capture with cpal. Audio is downmixed to mono, low-pass filtered
//! and resampled to 16 kHz (what Whisper expects), then appended to a shared
//! rolling buffer that the recognition worker reads from.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::JoinHandle;
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample};
use parking_lot::Mutex;
use serde::Serialize;

pub const SAMPLE_RATE: u32 = 16_000;

/// Rolling 16 kHz mono buffer addressed by absolute sample index since the
/// session started, so the worker can refer to stable positions while old
/// audio is trimmed away.
#[derive(Default)]
pub struct AudioBuffer {
    samples: Vec<f32>,
    start: u64,
}

impl AudioBuffer {
    pub fn push(&mut self, data: &[f32]) {
        self.samples.extend_from_slice(data);
    }

    /// Absolute index one past the newest sample.
    pub fn end(&self) -> u64 {
        self.start + self.samples.len() as u64
    }

    /// Copy `[from, to)` (absolute indices), clamped to what is retained.
    pub fn slice(&self, from: u64, to: u64) -> Vec<f32> {
        let from = from.max(self.start);
        let to = to.min(self.end());
        if to <= from {
            return Vec::new();
        }
        let a = (from - self.start) as usize;
        let b = (to - self.start) as usize;
        self.samples[a..b].to_vec()
    }

    /// Drop everything older than `keep` samples before the end.
    pub fn trim(&mut self, keep: usize) {
        if self.samples.len() > keep + SAMPLE_RATE as usize {
            let drop = self.samples.len() - keep;
            self.samples.drain(..drop);
            self.start += drop as u64;
        }
    }
}

/// Streaming resampler: windowed-sinc low-pass followed by linear
/// interpolation. Plenty for speech recognition and allocation-light.
struct Resampler {
    step: f64,
    taps: Vec<f32>,
    history: Vec<f32>,
    prev: f32,
    pos: f64,
}

impl Resampler {
    fn new(in_rate: u32) -> Self {
        let step = in_rate as f64 / SAMPLE_RATE as f64;
        let taps = if in_rate > SAMPLE_RATE {
            // Cut a little below the 8 kHz Nyquist of the output rate.
            let cutoff = 7_200.0 / in_rate as f64;
            let n = 33usize;
            let mid = (n - 1) as f64 / 2.0;
            let mut taps: Vec<f32> = (0..n)
                .map(|i| {
                    let x = i as f64 - mid;
                    let sinc = if x == 0.0 {
                        2.0 * cutoff
                    } else {
                        (2.0 * std::f64::consts::PI * cutoff * x).sin() / (std::f64::consts::PI * x)
                    };
                    let window = 0.54 - 0.46 * (2.0 * std::f64::consts::PI * i as f64 / (n - 1) as f64).cos();
                    (sinc * window) as f32
                })
                .collect();
            let sum: f32 = taps.iter().sum();
            taps.iter_mut().for_each(|t| *t /= sum);
            taps
        } else {
            vec![1.0]
        };
        let history = vec![0.0; taps.len() - 1];
        Self { step, taps, history, prev: 0.0, pos: 0.0 }
    }

    fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        if input.is_empty() {
            return;
        }
        if (self.step - 1.0).abs() < f64::EPSILON {
            out.extend_from_slice(input);
            return;
        }
        let n = self.taps.len();
        let mut ext = std::mem::take(&mut self.history);
        ext.extend_from_slice(input);
        let filtered: Vec<f32> = (0..input.len())
            .map(|i| ext[i..i + n].iter().zip(&self.taps).map(|(a, b)| a * b).sum())
            .collect();
        self.history = ext[ext.len() - (n - 1)..].to_vec();

        // `pos` is relative to filtered[0]; -1 refers to the previous chunk's
        // last sample so interpolation is continuous across callbacks.
        let last = (filtered.len() - 1) as f64;
        while self.pos <= last {
            let i = self.pos.floor();
            let frac = (self.pos - i) as f32;
            let a = if i < 0.0 { self.prev } else { filtered[i as usize] };
            let b = filtered.get((i + 1.0) as usize).copied().unwrap_or(a);
            out.push(a + (b - a) * frac);
            self.pos += self.step;
        }
        self.pos -= filtered.len() as f64;
        self.prev = *filtered.last().unwrap();
    }
}

/// Read a 16-bit PCM, 16 kHz WAV file as mono f32 samples.
pub fn read_wav_16k(path: &std::path::Path) -> anyhow::Result<Vec<f32>> {
    let bytes = std::fs::read(path)?;
    anyhow::ensure!(bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE", "not a WAV file");
    let (mut pos, mut channels, mut rate, mut bits) = (12usize, 1u16, 0u32, 0u16);
    while pos + 8 <= bytes.len() {
        let id = &bytes[pos..pos + 4];
        let len = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into()?) as usize;
        let body = &bytes[pos + 8..(pos + 8 + len).min(bytes.len())];
        if id == b"fmt " {
            channels = u16::from_le_bytes(body[2..4].try_into()?);
            rate = u32::from_le_bytes(body[4..8].try_into()?);
            bits = u16::from_le_bytes(body[14..16].try_into()?);
        } else if id == b"data" {
            anyhow::ensure!(bits == 16 && rate == SAMPLE_RATE, "need 16-bit 16 kHz audio (got {bits}-bit {rate} Hz)");
            return Ok(body
                .chunks_exact(2 * channels as usize)
                .map(|f| i16::from_le_bytes([f[0], f[1]]) as f32 / 32768.0)
                .collect());
        }
        pos += 8 + len + (len & 1);
    }
    anyhow::bail!("no audio data in WAV file")
}

/// Development aid: play a WAV file into the capture buffer in real time,
/// standing in for the microphone (`REFLEX_DEV_AUDIO_FILE`).
pub fn start_file_capture(
    path: std::path::PathBuf,
    shared: &CaptureShared,
    stop: Arc<AtomicBool>,
) -> anyhow::Result<(JoinHandle<()>, String)> {
    let mut audio = read_wav_16k(&path)?;
    audio.extend(std::iter::repeat_n(0.0, SAMPLE_RATE as usize * 2));
    let buffer = shared.buffer.clone();
    let level = shared.level.clone();
    let name = format!("File: {}", path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default());
    let handle = std::thread::spawn(move || {
        let chunk = SAMPLE_RATE as usize / 50;
        let start = std::time::Instant::now();
        for (i, part) in audio.chunks(chunk).enumerate() {
            if stop.load(Ordering::Relaxed) {
                return;
            }
            buffer.lock().push(part);
            let rms = (part.iter().map(|s| s * s).sum::<f32>() / part.len() as f32).sqrt();
            level.store((((20.0 * rms.max(1e-6).log10()) + 60.0) / 60.0).clamp(0.0, 1.0).to_bits(), Ordering::Relaxed);
            if let Some(wait) = Duration::from_millis(((i + 1) * 20) as u64).checked_sub(start.elapsed()) {
                std::thread::sleep(wait);
            }
        }
        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(40));
        }
    });
    Ok((handle, name))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InputDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

pub fn list_input_devices() -> anyhow::Result<Vec<InputDevice>> {
    let host = cpal::default_host();
    let default_id = host
        .default_input_device()
        .and_then(|d| d.id().ok())
        .map(|id| id.to_string());
    let mut out = Vec::new();
    for device in host.input_devices()? {
        let Ok(id) = device.id() else { continue };
        let id = id.to_string();
        let name = device
            .description()
            .map(|d| d.name().to_string())
            .unwrap_or_else(|_| id.clone());
        out.push(InputDevice { is_default: Some(&id) == default_id.as_ref(), id, name });
    }
    Ok(out)
}

/// Shared capture outputs read by the worker and the level meter.
pub struct CaptureShared {
    pub buffer: Arc<Mutex<AudioBuffer>>,
    /// Smoothed input level (f32 bits), 0..1 on a dB scale.
    pub level: Arc<AtomicU32>,
}

fn select_device(device_id: Option<&str>) -> anyhow::Result<cpal::Device> {
    let host = cpal::default_host();
    if let Some(id) = device_id.filter(|s| !s.is_empty()) {
        if let Ok(parsed) = id.parse() {
            if let Some(device) = host.device_by_id(&parsed) {
                return Ok(device);
            }
        }
        log::warn!("microphone {id} not found, falling back to default");
    }
    host.default_input_device()
        .ok_or_else(|| anyhow::anyhow!("No microphone found. Connect a microphone and try again."))
}

/// Start capturing on a dedicated thread (cpal streams are not `Send` on
/// every platform, so the stream lives and dies on that thread). Returns once
/// the stream is running, or with the error that prevented it.
pub fn start_capture(
    device_id: Option<String>,
    shared: &CaptureShared,
    stop: Arc<AtomicBool>,
) -> anyhow::Result<(JoinHandle<()>, String)> {
    let buffer = shared.buffer.clone();
    let level = shared.level.clone();
    let (ready_tx, ready_rx) = mpsc::channel::<anyhow::Result<String>>();
    let thread_stop = stop.clone();

    let handle = std::thread::Builder::new()
        .name("reflex-audio".into())
        .spawn(move || {
            let result = (|| -> anyhow::Result<(cpal::Stream, String)> {
                let device = select_device(device_id.as_deref())?;
                let name = device
                    .description()
                    .map(|d| d.name().to_string())
                    .unwrap_or_else(|_| "Microphone".into());
                let config = device.default_input_config()?;
                let stream = match config.sample_format() {
                    SampleFormat::F32 => build::<f32>(&device, &config, buffer, level)?,
                    SampleFormat::I16 => build::<i16>(&device, &config, buffer, level)?,
                    SampleFormat::I32 => build::<i32>(&device, &config, buffer, level)?,
                    SampleFormat::U16 => build::<u16>(&device, &config, buffer, level)?,
                    SampleFormat::I8 => build::<i8>(&device, &config, buffer, level)?,
                    other => anyhow::bail!("unsupported microphone sample format {other:?}"),
                };
                stream.play()?;
                Ok((stream, name))
            })();

            match result {
                Ok((stream, name)) => {
                    let _ = ready_tx.send(Ok(name));
                    while !thread_stop.load(Ordering::Relaxed) {
                        std::thread::sleep(Duration::from_millis(40));
                    }
                    drop(stream);
                }
                Err(e) => {
                    let _ = ready_tx.send(Err(e));
                }
            }
        })?;

    match ready_rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(name)) => Ok((handle, name)),
        Ok(Err(e)) => {
            let _ = handle.join();
            Err(e)
        }
        Err(_) => {
            stop.store(true, Ordering::Relaxed);
            anyhow::bail!("Timed out opening the microphone. Check microphone permissions.")
        }
    }
}

fn build<T>(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    buffer: Arc<Mutex<AudioBuffer>>,
    level: Arc<AtomicU32>,
) -> anyhow::Result<cpal::Stream>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels() as usize;
    let mut resampler = Resampler::new(config.sample_rate());
    let mut mono = Vec::<f32>::with_capacity(4096);
    let mut resampled = Vec::<f32>::with_capacity(4096);
    let mut smoothed = 0.0f32;

    let stream = device.build_input_stream(
        config.clone().into(),
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            mono.clear();
            mono.extend(data.chunks(channels).map(|frame| {
                frame.iter().map(|&s| f32::from_sample(s)).sum::<f32>() / channels as f32
            }));
            resampled.clear();
            resampler.process(&mono, &mut resampled);
            buffer.lock().push(&resampled);

            // Level meter: RMS mapped from -60..0 dBFS to 0..1 with fast
            // attack / slow release.
            if !mono.is_empty() {
                let rms = (mono.iter().map(|s| s * s).sum::<f32>() / mono.len() as f32).sqrt();
                let db = 20.0 * rms.max(1e-6).log10();
                let norm = ((db + 60.0) / 60.0).clamp(0.0, 1.0);
                smoothed = if norm > smoothed { norm } else { smoothed * 0.9 + norm * 0.1 };
                level.store(smoothed.to_bits(), Ordering::Relaxed);
            }
        },
        |e| log::warn!("microphone stream error: {e}"),
        None,
    )?;
    Ok(stream)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampler_produces_expected_length() {
        let mut r = Resampler::new(48_000);
        let mut out = Vec::new();
        for _ in 0..100 {
            r.process(&vec![0.25; 480], &mut out);
        }
        // 48 000 input samples -> ~16 000 output samples.
        assert!((out.len() as i64 - 16_000).abs() <= 2, "got {}", out.len());
        // DC passes through the low-pass filter unchanged once settled.
        assert!((out[out.len() - 1] - 0.25).abs() < 1e-3);
    }

    #[test]
    fn buffer_slices_by_absolute_index() {
        let mut b = AudioBuffer::default();
        b.push(&vec![1.0; 40_000]);
        b.trim(16_000);
        assert_eq!(b.end(), 40_000);
        assert_eq!(b.slice(0, 40_000).len(), 16_000);
        assert_eq!(b.slice(39_000, 41_000).len(), 1_000);
    }
}
