import { describe, expect, it } from 'vitest'
import { cleanText, collapseLoops, FRAME, SampleBuffer, Vad } from './vad'

const tone = (amp: number) => Float32Array.from({ length: FRAME }, (_, i) => amp * Math.sin(i * 0.3))

describe('web speech helpers (parity with the Rust engine)', () => {
  it('detects speech and the pause after it', () => {
    const vad = new Vad(0.5, 400)
    const events: ReturnType<Vad['process']>[] = []
    let at = 0
    const feed = (amp: number, frames: number) => {
      for (let i = 0; i < frames; i++, at += FRAME) {
        const e = vad.process(tone(amp), at)
        if (e) events.push(e)
      }
    }
    feed(0.001, 50)
    feed(0.2, 40)
    feed(0.001, 40)
    expect(events).toEqual([
      { type: 'start', at: 50 * FRAME },
      { type: 'end', at: 90 * FRAME },
    ])
  })

  it('slices a rolling buffer by absolute index', () => {
    const b = new SampleBuffer()
    b.push(new Float32Array(40_000).fill(1))
    b.trim(16_000)
    expect(b.end()).toBe(40_000)
    expect(b.slice(0, 40_000).length).toBe(16_000)
    expect(b.slice(39_000, 41_000).length).toBe(1_000)
  })

  it('collapses repetition loops but keeps a genuine double repeat', () => {
    expect(collapseLoops('a b c b c b c d'.split(' ')).join(' ')).toBe('a b c d')
    expect(collapseLoops('we have built, we have built and'.split(' ')).length).toBe(7)
    expect(cleanText(' [BLANK_AUDIO] hello (laughs) world ♪')).toBe('hello world')
  })
})
