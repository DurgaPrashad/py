//! Streaming recognition on top of whisper.cpp.
//!
//! Whisper is not a streaming model, so we emulate streaming the same way
//! whisper.cpp's `stream` example does: while the VAD reports speech, the
//! most recent `window_ms` of the current utterance is re-transcribed every
//! `step_ms`. Each pass yields a fresh *partial* hypothesis covering the last
//! few seconds; when the speaker pauses, one more pass produces the *final*
//! hypothesis for that utterance. The frontend aligns the tail of every
//! hypothesis against the script, so revisions between passes are harmless.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperState};

use super::audio::{AudioBuffer, SAMPLE_RATE};
use super::vad::{Vad, VadEvent, FRAME};

#[derive(Clone, Debug)]
pub struct EngineConfig {
    pub language: String,
    pub step_ms: u64,
    pub window_ms: u64,
    pub silence_ms: u64,
    pub vad_sensitivity: f32,
    pub fast_decode: bool,
    pub threads: i32,
    pub use_prompt: bool,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            language: "en".into(),
            step_ms: 300,
            window_ms: 6_000,
            silence_ms: 600,
            vad_sensitivity: 0.5,
            fast_decode: true,
            threads: default_threads(),
            use_prompt: true,
        }
    }
}

pub fn default_threads() -> i32 {
    std::thread::available_parallelism()
        .map(|n| n.get().clamp(2, 8) as i32)
        .unwrap_or(4)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub probability: f32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub utterance_id: u64,
    pub seq: u64,
    pub text: String,
    pub words: Vec<Word>,
    pub is_final: bool,
    /// Absolute stream time covered by this hypothesis.
    pub window_start_ms: u64,
    pub window_end_ms: u64,
    pub inference_ms: u64,
}

/// Events produced by the worker; the caller decides how to deliver them
/// (Tauri events in the app, stdout in the test harness).
pub enum EngineEvent {
    Transcript(Transcript),
    Speaking(bool),
}

pub fn ms(samples: u64) -> u64 {
    samples * 1000 / SAMPLE_RATE as u64
}

fn samples(ms: u64) -> u64 {
    ms * SAMPLE_RATE as u64 / 1000
}

/// Whisper markers for non-speech that should never reach alignment.
fn is_noise_token(word: &str) -> bool {
    let w = word.trim();
    (w.starts_with('[') && w.ends_with(']'))
        || (w.starts_with('(') && w.ends_with(')'))
        || (w.starts_with('*') && w.ends_with('*') && w.len() > 1)
        || w.starts_with('♪')
}

fn clean_text(text: &str) -> String {
    let mut out = String::new();
    let mut depth = 0i32;
    for c in text.chars() {
        match c {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = (depth - 1).max(0),
            '♪' => {}
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn word_key(w: &Word) -> String {
    w.text.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

/// Whisper sometimes gets stuck repeating a phrase ("basically building the
/// basically building the ..."). A phrase repeated three or more times in a
/// row is collapsed to one occurrence; a genuine double repeat by the
/// speaker ("we have built, we have built") is left alone.
pub fn collapse_loops(words: &mut Vec<Word>) -> bool {
    let mut changed = false;
    let mut i = 0;
    while i < words.len() {
        let mut collapsed = false;
        for n in 1..=16usize {
            if i + n * 3 > words.len() {
                break;
            }
            let keys: Vec<String> = words[i..i + n].iter().map(word_key).collect();
            let mut count = 1;
            while i + n * (count + 1) <= words.len()
                && words[i + n * count..i + n * (count + 1)].iter().map(word_key).eq(keys.iter().cloned())
            {
                count += 1;
            }
            if count >= 3 {
                words.drain(i + n..i + n * count);
                changed = true;
                collapsed = true;
                break;
            }
        }
        if !collapsed {
            i += 1;
        }
    }
    changed
}

pub struct Recognizer {
    ctx: Arc<WhisperContext>,
    state: WhisperState,
}

impl Recognizer {
    pub fn new(ctx: Arc<WhisperContext>) -> anyhow::Result<Self> {
        let state = ctx.create_state()?;
        Ok(Self { ctx, state })
    }

    /// Run a throwaway pass so Metal kernels and buffers are initialised
    /// before the user starts talking.
    pub fn warm_up(&mut self, cfg: &EngineConfig) {
        let silence = vec![0.0f32; SAMPLE_RATE as usize];
        let _ = self.transcribe(&silence, 0, cfg, "");
    }

    /// Transcribe `audio` (16 kHz mono) whose first sample is at absolute
    /// stream index `offset`.
    pub fn transcribe(
        &mut self,
        audio: &[f32],
        offset: u64,
        cfg: &EngineConfig,
        prompt: &str,
    ) -> anyhow::Result<(String, Vec<Word>)> {
        // whisper.cpp refuses inputs shorter than one second; pad with silence.
        let min_len = SAMPLE_RATE as usize + SAMPLE_RATE as usize / 10;
        let padded;
        let input: &[f32] = if audio.len() < min_len {
            let mut p = audio.to_vec();
            p.resize(min_len, 0.0);
            padded = p;
            &padded
        } else {
            audio
        };

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_n_threads(cfg.threads);
        params.set_language(match cfg.language.as_str() {
            "auto" | "" => None,
            lang => Some(lang),
        });
        params.set_translate(false);
        params.set_no_context(true);
        params.set_single_segment(true);
        params.set_no_timestamps(false);
        params.set_token_timestamps(true);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_suppress_nst(true);
        params.set_temperature(0.0);
        // No temperature fallback: a stable, bounded latency matters more
        // than squeezing out a better decode of one partial.
        params.set_temperature_inc(0.0);
        // Bound decoding to what this much audio could plausibly contain;
        // caps the cost of Whisper's occasional repetition loops.
        let secs = audio.len() as f32 / SAMPLE_RATE as f32;
        params.set_max_tokens(((secs * 6.0) as i32 + 16).clamp(24, 128));
        if cfg.fast_decode {
            // Shrink the encoder context to the audio we actually have
            // (1500 frames == 30 s). This is the single biggest latency win.
            let secs = input.len() as f32 / SAMPLE_RATE as f32;
            let ctx = ((secs / 30.0) * 1500.0).ceil() as i32 + 128;
            params.set_audio_ctx(ctx.clamp(256, 1500));
        }
        if cfg.use_prompt && !prompt.trim().is_empty() {
            params.set_initial_prompt(prompt);
        }

        self.state.full(params, input)?;

        let eot = self.ctx.token_eot();
        let mut text = String::new();
        let mut words: Vec<Word> = Vec::new();
        let base_ms = ms(offset);
        for segment in self.state.as_iter() {
            if segment.no_speech_probability() > 0.9 {
                continue;
            }
            if let Ok(s) = segment.to_str_lossy() {
                text.push_str(&s);
            }
            let mut current: Option<Word> = None;
            for i in 0..segment.n_tokens() {
                let Some(token) = segment.get_token(i) else { continue };
                if token.token_id() >= eot {
                    continue; // special / timestamp tokens
                }
                let Ok(piece) = token.to_str_lossy() else { continue };
                let data = token.token_data();
                let t0 = base_ms + (data.t0.max(0) as u64) * 10;
                let t1 = base_ms + (data.t1.max(0) as u64) * 10;
                let starts_word = piece.starts_with(' ') || current.is_none();
                if starts_word {
                    if let Some(w) = current.take() {
                        words.push(w);
                    }
                    current = Some(Word {
                        text: piece.trim().to_string(),
                        start_ms: t0,
                        end_ms: t1,
                        probability: token.token_probability(),
                    });
                } else if let Some(w) = current.as_mut() {
                    w.text.push_str(piece.as_ref());
                    w.end_ms = t1;
                    w.probability = w.probability.min(token.token_probability());
                }
            }
            if let Some(w) = current.take() {
                words.push(w);
            }
        }
        words.retain(|w| !w.text.is_empty() && !is_noise_token(&w.text));
        // Token timestamps past the audio we supplied are decoder artifacts.
        let end_ms = base_ms + ms(audio.len() as u64);
        for w in words.iter_mut() {
            w.start_ms = w.start_ms.min(end_ms);
            w.end_ms = w.end_ms.clamp(w.start_ms, end_ms);
        }
        if collapse_loops(&mut words) {
            text = words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
        }
        Ok((clean_text(&text), words))
    }
}

struct Utterance {
    id: u64,
    start: u64,
    end: Option<u64>,
    last_pass_end: u64,
    last_text: String,
}

/// The recognition loop. Runs until `stop` is set.
pub fn run(
    recognizer: &mut Recognizer,
    buffer: Arc<Mutex<AudioBuffer>>,
    prompt: Arc<Mutex<String>>,
    stop: Arc<AtomicBool>,
    cfg: EngineConfig,
    mut emit: impl FnMut(EngineEvent),
) {
    let mut vad = Vad::new(cfg.vad_sensitivity, cfg.silence_ms);
    let step = Duration::from_millis(cfg.step_ms);
    let window = samples(cfg.window_ms);
    let preroll = samples(250);
    let min_new = samples(cfg.step_ms.saturating_sub(50).max(100));
    let keep = (window + samples(4_000)) as usize;

    let mut vad_cursor = buffer.lock().end();
    let mut utterance: Option<Utterance> = None;
    let mut next_id = 1u64;
    let mut seq = 0u64;
    let mut speaking = false;

    while !stop.load(Ordering::Relaxed) {
        let tick = Instant::now();

        // 1. Voice activity on all complete frames received since last tick.
        let (fresh, buffer_end) = {
            let b = buffer.lock();
            (b.slice(vad_cursor, b.end()), b.end())
        };
        let usable = fresh.len() / FRAME * FRAME;
        for (i, frame) in fresh[..usable].chunks(FRAME).enumerate() {
            let at = vad_cursor + (i * FRAME) as u64;
            match vad.process(frame, at) {
                Some(VadEvent::Start(start)) => {
                    if utterance.is_none() {
                        utterance = Some(Utterance {
                            id: next_id,
                            start: start.saturating_sub(preroll),
                            end: None,
                            last_pass_end: 0,
                            last_text: String::new(),
                        });
                        next_id += 1;
                    } else if let Some(u) = utterance.as_mut() {
                        // Speech resumed before the final pass ran: keep going.
                        u.end = None;
                    }
                }
                Some(VadEvent::End(end)) => {
                    if let Some(u) = utterance.as_mut() {
                        u.end = Some(end);
                    }
                }
                None => {}
            }
        }
        vad_cursor += usable as u64;
        if vad.in_speech() != speaking {
            speaking = vad.in_speech();
            emit(EngineEvent::Speaking(speaking));
        }

        // 2. Transcribe the active utterance.
        if let Some(u) = utterance.as_mut() {
            let is_final = u.end.is_some();
            // Include a short tail after the detected end so the last word
            // is not clipped.
            let end = match u.end {
                Some(e) => (e + samples(200)).min(buffer_end),
                None => buffer_end,
            };
            let has_new = end >= u.last_pass_end + min_new;
            if is_final || has_new {
                let from = u.start.max(end.saturating_sub(window));
                let audio = buffer.lock().slice(from, end);
                if audio.len() >= samples(200) as usize {
                    let prompt_text = prompt.lock().clone();
                    let started = Instant::now();
                    match recognizer.transcribe(&audio, from, &cfg, &prompt_text) {
                        Ok((text, words)) => {
                            let changed = text != u.last_text;
                            if changed || is_final {
                                seq += 1;
                                emit(EngineEvent::Transcript(Transcript {
                                    utterance_id: u.id,
                                    seq,
                                    text: text.clone(),
                                    words,
                                    is_final,
                                    window_start_ms: ms(from),
                                    window_end_ms: ms(end),
                                    inference_ms: started.elapsed().as_millis() as u64,
                                }));
                                u.last_text = text;
                            }
                        }
                        Err(e) => log::warn!("transcription failed: {e}"),
                    }
                    u.last_pass_end = end;
                }
                if is_final {
                    utterance = None;
                }
            }
        }

        buffer.lock().trim(keep);

        // Sleep out the remainder of the step. If inference ran long we go
        // again immediately with whatever audio has accumulated.
        let elapsed = tick.elapsed();
        if elapsed < step {
            std::thread::sleep(step - elapsed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(text: &str) -> Vec<Word> {
        text.split_whitespace()
            .map(|t| Word { text: t.into(), start_ms: 0, end_ms: 0, probability: 1.0 })
            .collect()
    }

    fn joined(w: &[Word]) -> String {
        w.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn collapses_repetition_loops() {
        let mut w = words("we are uh, basically building the uh, basically building the uh, basically building the uh, basically building");
        assert!(collapse_loops(&mut w));
        assert_eq!(joined(&w), "we are uh, basically building the uh, basically building");
    }

    #[test]
    fn keeps_genuine_double_repeat() {
        let mut w = words("We have built, we have built and validated");
        assert!(!collapse_loops(&mut w));
        assert_eq!(w.len(), 8);
    }

    #[test]
    fn strips_non_speech_markers() {
        assert_eq!(clean_text(" [BLANK_AUDIO] hello (laughs) world ♪"), "hello world");
    }
}
