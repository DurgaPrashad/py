//! Lightweight energy-based voice activity detection with an adaptive noise
//! floor. It gates Whisper so that silence is never transcribed (which is
//! where Whisper hallucinates) and marks utterance boundaries, which voice
//! commands rely on.

pub const FRAME: usize = 320; // 20 ms at 16 kHz

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum VadEvent {
    /// Speech began at the start of the frame with this absolute index.
    Start(u64),
    /// Speech ended (hangover elapsed) at this absolute index.
    End(u64),
}

pub struct Vad {
    noise_floor: f32,
    ratio: f32,
    min_level: f32,
    onset_frames: u32,
    hangover_frames: u32,
    loud_run: u32,
    quiet_run: u32,
    in_speech: bool,
    speech_start: u64,
}

impl Vad {
    /// `sensitivity` in 0..1 (higher = triggers on quieter speech);
    /// `silence_ms` is how long a pause must last to end an utterance.
    pub fn new(sensitivity: f32, silence_ms: u64) -> Self {
        let s = sensitivity.clamp(0.0, 1.0);
        Self {
            noise_floor: 0.002,
            ratio: 4.0 - 2.5 * s,
            min_level: 0.0065 - 0.005 * s,
            onset_frames: 3,
            hangover_frames: (silence_ms / 20).max(5) as u32,
            loud_run: 0,
            quiet_run: 0,
            in_speech: false,
            speech_start: 0,
        }
    }

    pub fn in_speech(&self) -> bool {
        self.in_speech
    }

    fn threshold(&self) -> f32 {
        (self.noise_floor * self.ratio).max(self.min_level)
    }

    /// Feed one 20 ms frame starting at absolute sample index `at`.
    pub fn process(&mut self, frame: &[f32], at: u64) -> Option<VadEvent> {
        let rms = (frame.iter().map(|s| s * s).sum::<f32>() / frame.len().max(1) as f32).sqrt();
        let threshold = self.threshold();

        if !self.in_speech {
            // Track the noise floor only while nobody is speaking; follow
            // drops quickly and rises slowly.
            if rms < self.noise_floor {
                self.noise_floor = self.noise_floor * 0.7 + rms * 0.3;
            } else {
                self.noise_floor = self.noise_floor * 0.995 + rms * 0.005;
            }
            self.noise_floor = self.noise_floor.clamp(0.0002, 0.05);

            if rms > threshold {
                if self.loud_run == 0 {
                    self.speech_start = at;
                }
                self.loud_run += 1;
                if self.loud_run >= self.onset_frames {
                    self.in_speech = true;
                    self.quiet_run = 0;
                    return Some(VadEvent::Start(self.speech_start));
                }
            } else {
                self.loud_run = 0;
            }
            None
        } else {
            if rms < threshold * 0.8 {
                self.quiet_run += 1;
                if self.quiet_run >= self.hangover_frames {
                    self.in_speech = false;
                    self.loud_run = 0;
                    let end = at + FRAME as u64 - (self.quiet_run as u64 * FRAME as u64);
                    return Some(VadEvent::End(end));
                }
            } else {
                self.quiet_run = 0;
            }
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(amp: f32) -> Vec<f32> {
        (0..FRAME).map(|i| amp * (i as f32 * 0.3).sin()).collect()
    }

    #[test]
    fn detects_speech_and_pause() {
        let mut vad = Vad::new(0.5, 400);
        let mut at = 0u64;
        let mut events = Vec::new();
        let mut feed = |vad: &mut Vad, amp: f32, frames: usize, events: &mut Vec<VadEvent>| {
            for _ in 0..frames {
                if let Some(e) = vad.process(&tone(amp), at) {
                    events.push(e);
                }
                at += FRAME as u64;
            }
        };
        feed(&mut vad, 0.001, 50, &mut events); // room noise
        feed(&mut vad, 0.2, 40, &mut events); // speech
        feed(&mut vad, 0.001, 40, &mut events); // pause
        assert!(matches!(events[0], VadEvent::Start(s) if s == 50 * FRAME as u64));
        assert!(matches!(events[1], VadEvent::End(e) if e == 90 * FRAME as u64));
    }
}
