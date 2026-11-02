import { describe, expect, it } from 'vitest'
import { firstVisibleLine, MAX_LINES, promptHeightEm, rowRange, shownLines, windowStart } from './layout'

describe('horizontal lines', () => {
  it('keeps the current word near the centre of the first line', () => {
    expect(windowStart(0, 100, 8)).toBe(0)
    expect(windowStart(20, 100, 8)).toBe(17)
    expect(windowStart(99, 100, 8)).toBe(92)
  })

  it('carries the next words on to the lines below', () => {
    expect(rowRange(17, 0, 8, 100)).toEqual([17, 25])
    expect(rowRange(17, 1, 8, 100)).toEqual([25, 33])
    expect(rowRange(17, 2, 8, 100)).toEqual([33, 41])
  })

  it('never repeats or skips a word between lines', () => {
    for (let row = 0; row < 3; row++) expect(rowRange(4, row, 6, 100)[1]).toBe(rowRange(4, row + 1, 6, 100)[0])
  })

  it('runs out of words at the end of the script', () => {
    expect(rowRange(92, 0, 8, 100)).toEqual([92, 100])
    const [from, to] = rowRange(92, 1, 8, 100)
    expect(to).toBeLessThanOrEqual(from)
  })
})

describe('vertical lines', () => {
  it('keeps the current line on top', () => {
    expect(firstVisibleLine(0, 10, 3)).toBe(0)
    expect(firstVisibleLine(4, 10, 3)).toBe(4)
  })

  it('stops moving when the text runs out, so the lines stay full', () => {
    expect(firstVisibleLine(7, 10, 3)).toBe(7)
    expect(firstVisibleLine(8, 10, 3)).toBe(7)
    expect(firstVisibleLine(9, 10, 3)).toBe(7)
  })

  it('does not move a script shorter than the lines shown', () => {
    expect(firstVisibleLine(1, 2, 3)).toBe(0)
  })
})

describe('sizing', () => {
  it('keeps one line the height the window has always used', () => {
    expect(promptHeightEm(1)).toBeCloseTo(1.94)
  })

  it('grows by one line and one gap', () => {
    expect(promptHeightEm(3) - promptHeightEm(2)).toBeCloseTo(1.38)
  })

  it('keeps the setting in range', () => {
    expect(shownLines({ lines: 0 })).toBe(1)
    expect(shownLines({ lines: 2.4 })).toBe(2)
    expect(shownLines({ lines: 99 })).toBe(MAX_LINES)
  })
})
