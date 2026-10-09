import { describe, expect, it } from 'vitest'
import { textToScript } from './script'

describe('textToScript', () => {
  it('joins a title wrapped over two lines', () => {
    expect(textToScript('Building the operating infrastructure\nfor global Voice AI')).toBe(
      'Building the operating infrastructure for global Voice AI.',
    )
  })

  it('keeps titles, bullets and paragraphs as separate sentences', () => {
    expect(textToScript('Why now\n\n- Voice is natural\n- Models run in real time\nLatency under 300 ms')).toBe(
      'Why now. Voice is natural. Models run in real time. Latency under 300 ms.',
    )
  })

  it('does not double punctuation', () => {
    expect(textToScript('Hello there!\nWe are live.')).toBe('Hello there! We are live.')
  })

  it('joins after an open-ended line', () => {
    expect(textToScript('Built for teams and\nEnterprises worldwide')).toBe('Built for teams and Enterprises worldwide.')
  })
})
