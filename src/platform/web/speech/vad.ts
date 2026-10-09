// Energy-based voice activity detection with an adaptive noise floor.
// TypeScript port of src-tauri/src/speech/vad.rs (same constants).

export const SAMPLE_RATE = 16_000
export const FRAME = 320 // 20 ms

export type VadEvent = { type: 'start'; at: number } | { type: 'end'; at: number }

export class Vad {
  private noiseFloor = 0.002
  private readonly ratio: number
  private readonly minLevel: number
  private readonly onsetFrames = 3
  private readonly hangoverFrames: number
  private loudRun = 0
  private quietRun = 0
  private speechStart = 0
  inSpeech = false

  constructor(sensitivity: number, silenceMs: number) {
    const s = Math.max(0, Math.min(1, sensitivity))
    this.ratio = 4.0 - 2.5 * s
    this.minLevel = 0.0065 - 0.005 * s
    this.hangoverFrames = Math.max(5, Math.floor(silenceMs / 20))
  }

  /** Feed one 20 ms frame starting at absolute sample index `at`. */
  process(frame: Float32Array, at: number): VadEvent | null {
    let sum = 0
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
    const rms = Math.sqrt(sum / Math.max(1, frame.length))
    const threshold = Math.max(this.noiseFloor * this.ratio, this.minLevel)

    if (!this.inSpeech) {
      if (rms < this.noiseFloor) this.noiseFloor = this.noiseFloor * 0.7 + rms * 0.3
      else this.noiseFloor = this.noiseFloor * 0.995 + rms * 0.005
      this.noiseFloor = Math.max(0.0002, Math.min(0.05, this.noiseFloor))
      if (rms > threshold) {
        if (this.loudRun === 0) this.speechStart = at
        this.loudRun++
        if (this.loudRun >= this.onsetFrames) {
          this.inSpeech = true
          this.quietRun = 0
          return { type: 'start', at: this.speechStart }
        }
      } else {
        this.loudRun = 0
      }
      return null
    }
    if (rms < threshold * 0.8) {
      this.quietRun++
      if (this.quietRun >= this.hangoverFrames) {
        this.inSpeech = false
        this.loudRun = 0
        return { type: 'end', at: at + FRAME - this.quietRun * FRAME }
      }
    } else {
      this.quietRun = 0
    }
    return null
  }
}

/** Rolling 16 kHz buffer addressed by absolute sample index. */
export class SampleBuffer {
  private data = new Float32Array(SAMPLE_RATE * 8)
  private len = 0
  private start = 0

  push(chunk: Float32Array) {
    if (this.len + chunk.length > this.data.length) {
      const grown = new Float32Array(Math.max(this.data.length * 2, this.len + chunk.length))
      grown.set(this.data.subarray(0, this.len))
      this.data = grown
    }
    this.data.set(chunk, this.len)
    this.len += chunk.length
  }

  end(): number {
    return this.start + this.len
  }

  slice(from: number, to: number): Float32Array {
    const a = Math.max(from, this.start) - this.start
    const b = Math.min(to, this.end()) - this.start
    return b > a ? this.data.slice(a, b) : new Float32Array(0)
  }

  /** Keep only the newest `keep` samples. */
  trim(keep: number) {
    if (this.len > keep + SAMPLE_RATE) {
      const drop = this.len - keep
      this.data.copyWithin(0, drop, this.len)
      this.len -= drop
      this.start += drop
    }
  }
}

const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/**
 * Collapse Whisper repetition loops: a phrase repeated three or more times in
 * a row becomes one occurrence (a genuine double repeat is kept).
 */
export function collapseLoops(words: string[]): string[] {
  const out = [...words]
  let i = 0
  while (i < out.length) {
    let collapsed = false
    for (let n = 1; n <= 16 && i + n * 3 <= out.length; n++) {
      const unit = out.slice(i, i + n).map(key)
      let count = 1
      while (i + n * (count + 1) <= out.length && out.slice(i + n * count, i + n * (count + 1)).every((w, k) => key(w) === unit[k])) count++
      if (count >= 3) {
        out.splice(i + n, n * (count - 1))
        collapsed = true
        break
      }
    }
    if (!collapsed) i++
  }
  return out
}

/** Strip Whisper non-speech markers like [BLANK_AUDIO] or (music). */
export function cleanText(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)|♪/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
