// Where the reading text goes, in numbers. Lengths are in em of the text size.
export const MAX_LINES = 5
export const LINE_EM = 1.18
export const LINE_GAP_EM = 0.2
const EDGE_EM = 0.38

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** First word of the N-word window, keeping `current` near the centre. */
export function windowStart(current: number, total: number, visible: number): number {
  return clamp(current - Math.floor((visible - 1) / 2), 0, Math.max(0, total - visible))
}

/** The words of one horizontal line: lines below the first carry on from it. */
export function rowRange(start: number, row: number, visible: number, total: number): [number, number] {
  return [start + row * visible, Math.min(total, start + (row + 1) * visible)]
}

/** First line on screen in vertical reading: the current line, until the text runs out. */
export function firstVisibleLine(currentLine: number, lineCount: number, shown: number): number {
  return clamp(currentLine, 0, Math.max(0, lineCount - shown))
}

/** How many lines the settings ask for. */
export const shownLines = (config: { lines: number }) => clamp(Math.round(config.lines), 1, MAX_LINES)

/** Height of the reading text, so a window can be sized to fit it. */
export const promptHeightEm = (lines: number) => EDGE_EM * 2 + LINE_EM * lines + LINE_GAP_EM * (lines - 1)
