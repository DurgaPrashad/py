import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { ScriptWord, Settings } from '../../types'
import { firstVisibleLine, LINE_EM, LINE_GAP_EM, promptHeightEm, rowRange, shownLines, windowStart } from './layout'

interface Props {
  words: ScriptWord[]
  /** Display index of the highlighted word. */
  current: number
  config: Settings['teleprompter']
  onWordClick?: (index: number) => void
  emptyText?: ReactNode
  /** Horizontal breathing room inside the strip, px. */
  pad?: number
}

type Config = Settings['teleprompter']

interface WordRect {
  left: number
  top: number
  width: number
}

interface ReadingProps {
  texts: string[]
  current: number
  config: Config
  lines: number
  onWordClick?: (index: number) => void
  pad: number
}

const UPCOMING_OPACITY = 0.72
const EASE = 'cubic-bezier(0.22, 0.8, 0.24, 1)'
const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const sameRects = (a: WordRect[], b: WordRect[]) => a.length === b.length && a.every((r, i) => r.left === b[i].left && r.top === b[i].top && r.width === b[i].width)

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // The strip may be rendered into another window (picture-in-picture);
    // observe with that window's own ResizeObserver.
    const win = (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis
    const ro = new win.ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/**
 * Changes when this window's fonts finish loading: text measured before that
 * has moved. A floating window loads its fonts separately from the main page.
 */
function useFontsLoaded(ref: RefObject<HTMLElement | null>) {
  const [loaded, setLoaded] = useState(0)
  useLayoutEffect(() => {
    const fonts = ref.current?.ownerDocument.fonts
    if (!fonts) return
    const bump = () => setLoaded((n) => n + 1)
    fonts.addEventListener('loadingdone', bump)
    return () => fonts.removeEventListener('loadingdone', bump)
  }, [ref])
  return loaded
}

/** Whether to animate: off after a jump (new slide, new sizing), back on the frame after. */
function useAnimate(ref: RefObject<HTMLElement | null>, ready: boolean) {
  const [animate, setAnimate] = useState(false)
  useLayoutEffect(() => {
    if (animate || !ready) return
    const win = ref.current?.ownerDocument.defaultView ?? window
    const id = win.requestAnimationFrame(() => win.requestAnimationFrame(() => setAnimate(true)))
    return () => win.cancelAnimationFrame(id)
  }, [animate, ready, ref])
  return [animate, setAnimate] as const
}

function wordLook(
  config: Config,
  { visible, spoken, isCurrent, upcoming }: { visible: boolean; spoken: boolean; isCurrent: boolean; upcoming: boolean },
): { color: string; opacity: number } {
  const style = config.highlightStyle
  let color = 'var(--app-fg)'
  let opacity = visible ? 1 : 0
  if (visible && spoken && config.dimSpoken) opacity = style === 'bold' ? 0.38 : 0.42
  if (visible && !spoken && !isCurrent && style === 'bold') opacity = 0.62
  if (visible && upcoming) opacity = Math.min(opacity, UPCOMING_OPACITY)
  if (isCurrent && style !== 'bold' && style !== 'underline') color = 'var(--app-accent)'
  return { color, opacity }
}

/** The pill or underline behind the current word. */
function Marker({ kind, left, top, width, px, ms }: { kind: Config['highlightStyle']; left: number; top: number; width: number; px: number; ms: number }) {
  if (kind !== 'pill' && kind !== 'underline') return null
  const pill = kind === 'pill'
  const thickness = Math.max(3, px * 0.07)
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: left - (pill ? 0.16 * px : 0),
        top: top + (pill ? -0.16 * px : (LINE_EM + 0.18) * px - thickness),
        width: width + (pill ? 0.32 * px : 0),
        height: pill ? (LINE_EM + 0.32) * px : thickness,
        borderRadius: pill ? px * 0.22 : 99,
        background: pill ? 'var(--app-accent-soft)' : 'var(--app-accent)',
        boxShadow: pill ? 'inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 35%, transparent)' : 'none',
        transition: `left ${ms}ms ${EASE}, top ${ms}ms ${EASE}, width ${ms}ms ${EASE}`,
      }}
    />
  )
}

/**
 * Words slide sideways. Exactly `wordsVisible` words are visible on each line.
 * All words of the slide sit on one track per line; moving the window slides
 * the tracks (GPU transform) while words leaving the window fade out and words
 * entering fade in, so progress feels continuous rather than jumpy. Lines below
 * the first carry on with the words coming next.
 */
function HorizontalReading({ texts, current, config, lines, onWordClick, pad: PAD }: ReadingProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wordRefs = useRef<(HTMLSpanElement | null)[][]>([])
  const width = useWidth(containerRef)
  const fontsLoaded = useFontsLoaded(containerRef)
  const [fontPx, setFontPx] = useState(config.fontSize)
  const [layout, setLayout] = useState<{ offsets: number[]; pillLeft: number; pillWidth: number; ready: boolean }>({ offsets: [], pillLeft: 0, pillWidth: 0, ready: false })
  const [animate, setAnimate] = useAnimate(containerRef, layout.ready)

  const N = Math.max(1, Math.round(config.wordsVisible))
  const total = texts.length
  const idx = clamp(current, 0, Math.max(0, total - 1))
  const start = windowStart(idx, total, N)

  // New slide / new sizing: start from the configured size and jump (no
  // animation) to the right place.
  useLayoutEffect(() => {
    setFontPx(config.fontSize)
    setAnimate(false)
  }, [texts, config.fontSize, N, width, lines, fontsLoaded, setAnimate])

  // Shrink the font if the widest N-word window would not fit.
  useLayoutEffect(() => {
    if (!width || total === 0) return
    const els = wordRefs.current[0] ?? []
    let widest = 0
    for (let i = 0; i <= Math.max(0, total - N); i++) {
      const a = els[i]
      const b = els[Math.min(total, i + N) - 1]
      if (a && b) widest = Math.max(widest, b.offsetLeft + b.offsetWidth - a.offsetLeft)
    }
    const available = width - PAD * 2
    if (widest > available) {
      const next = Math.max(14, Math.floor((fontPx * available) / widest))
      if (next < fontPx) setFontPx(next)
    }
  }, [width, fontPx, total, N, texts, PAD])

  // Position each track so its window is aligned in the strip.
  useLayoutEffect(() => {
    if (!width) return
    const offsets: number[] = []
    for (let row = 0; row < lines; row++) {
      const [from, to] = rowRange(start, row, N, total)
      const a = wordRefs.current[row]?.[from]
      const b = wordRefs.current[row]?.[to - 1]
      if (!a || !b || to <= from) {
        offsets.push(0)
        continue
      }
      const left = a.offsetLeft
      const right = b.offsetLeft + b.offsetWidth
      if (config.align === 'left') offsets.push(PAD - left)
      else if (config.align === 'right') offsets.push(width - PAD - right)
      else offsets.push((width - (right - left)) / 2 - left)
    }
    const c = wordRefs.current[0]?.[idx]
    setLayout({ offsets, pillLeft: c?.offsetLeft ?? 0, pillWidth: c?.offsetWidth ?? 0, ready: true })
  }, [start, idx, N, total, lines, fontPx, width, config.align, texts, PAD])

  const ms = animate ? config.transitionMs : 0
  const style = config.highlightStyle

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden select-none" style={{ fontSize: fontPx }}>
      <div className="flex flex-col py-[0.38em]" style={{ rowGap: `${LINE_GAP_EM}em`, opacity: layout.ready ? 1 : 0 }}>
        {Array.from({ length: lines }, (_, row) => {
          const [from, to] = rowRange(start, row, N, total)
          return (
            <div
              key={row}
              className="relative flex w-max whitespace-nowrap will-change-transform"
              style={{ transform: `translate3d(${layout.offsets[row] ?? 0}px,0,0)`, transition: `transform ${ms}ms ${EASE}` }}
            >
              {row === 0 && <Marker kind={style} left={layout.pillLeft} top={0} width={layout.pillWidth} px={fontPx} ms={ms} />}
              {texts.map((text, i) => {
                const visible = i >= from && i < to
                const isCurrent = row === 0 && i === idx
                const { color, opacity } = wordLook(config, { visible, spoken: i < idx, isCurrent, upcoming: row > 0 })
                return (
                  <span
                    key={i}
                    ref={(el) => {
                      ;(wordRefs.current[row] ??= [])[i] = el
                    }}
                    onClick={onWordClick ? () => onWordClick(i) : undefined}
                    className={`relative mr-[0.3em] leading-[1.18] tracking-[-0.012em] ${onWordClick && visible ? 'cursor-pointer' : ''}`}
                    style={{
                      color,
                      opacity,
                      fontWeight: style === 'bold' && isCurrent ? 700 : 520,
                      transition: `opacity ${Math.max(ms, 1) * 0.8}ms ease, color 90ms ease`,
                      pointerEvents: visible ? 'auto' : 'none',
                    }}
                  >
                    {text}
                  </span>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Lines move up. The script wraps to the width of the strip and the current
 * line stays on top, with the words coming next on the lines below it; near
 * the end the text stops moving so the lines stay full.
 */
function VerticalReading({ texts, current, config, lines, onWordClick, pad }: ReadingProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([])
  const width = useWidth(containerRef)
  const fontsLoaded = useFontsLoaded(containerRef)
  const [rects, setRects] = useState<WordRect[]>([])
  const ready = rects.length === texts.length && rects.length > 0
  const [animate, setAnimate] = useAnimate(containerRef, ready)
  const px = config.fontSize

  const idx = clamp(current, 0, Math.max(0, texts.length - 1))

  // New slide / new sizing: jump (no animation) to the right place.
  useLayoutEffect(() => {
    setAnimate(false)
  }, [texts, px, width, config.align, pad, fontsLoaded, setAnimate])

  // Where each word landed, checked again at every word so the text can never
  // stay out of step with what is on screen.
  useLayoutEffect(() => {
    if (!width) return
    const next = texts.map((_, i) => {
      const el = wordRefs.current[i]
      return { left: el?.offsetLeft ?? 0, top: el?.offsetTop ?? 0, width: el?.offsetWidth ?? 0 }
    })
    setRects((prev) => (sameRects(prev, next) ? prev : next))
  }, [texts, px, width, config.align, pad, fontsLoaded, idx])

  const tops = useMemo(() => [...new Set(rects.map((r) => r.top))].sort((a, b) => a - b), [rects])
  const lineOf = useMemo(() => {
    const index = new Map(tops.map((top, line) => [top, line]))
    return rects.map((r) => index.get(r.top) ?? 0)
  }, [rects, tops])

  const currentLine = lineOf[idx] ?? 0
  const first = firstVisibleLine(currentLine, tops.length, lines)
  const scroll = (tops[first] ?? 0) - (tops[0] ?? 0)
  const here = rects[idx]
  const ms = animate ? config.transitionMs : 0
  const style = config.highlightStyle

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden select-none" style={{ fontSize: px, height: `${promptHeightEm(lines)}em` }}>
      <div
        className="relative flex flex-wrap py-[0.38em] will-change-transform"
        style={{
          paddingInline: pad,
          rowGap: `${LINE_GAP_EM}em`,
          columnGap: '0.3em',
          justifyContent: JUSTIFY[config.align],
          transform: `translate3d(0,${-scroll}px,0)`,
          transition: `transform ${ms}ms ${EASE}`,
          opacity: ready ? 1 : 0,
        }}
      >
        {here && <Marker kind={style} left={here.left} top={here.top} width={here.width} px={px} ms={ms} />}
        {texts.map((text, i) => {
          const line = lineOf[i] ?? 0
          const visible = line >= first && line < first + lines
          const isCurrent = i === idx
          const { color, opacity } = wordLook(config, { visible, spoken: i < idx, isCurrent, upcoming: line > currentLine })
          return (
            <span
              key={i}
              ref={(el) => {
                wordRefs.current[i] = el
              }}
              onClick={onWordClick ? () => onWordClick(i) : undefined}
              className={`relative max-w-full leading-[1.18] tracking-[-0.012em] ${onWordClick && visible ? 'cursor-pointer' : ''}`}
              style={{
                color,
                opacity,
                fontWeight: 520,
                // A stroke, not a heavier font: a wider word could re-wrap the line.
                WebkitTextStroke: style === 'bold' && isCurrent ? '0.024em currentColor' : undefined,
                overflowWrap: 'anywhere',
                transition: `opacity ${Math.max(ms, 1) * 0.8}ms ease, color 90ms ease`,
                pointerEvents: visible ? 'auto' : 'none',
              }}
            >
              {text}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** The reading text: horizontal or vertical, on as many lines as the settings ask for. */
export function Teleprompter({ words, current, config, onWordClick, emptyText = 'No script for this slide', pad = 28 }: Props) {
  const texts = useMemo(() => words.map((w) => (config.uppercase ? w.text.toUpperCase() : w.text)), [words, config.uppercase])
  const lines = shownLines(config)

  if (words.length === 0) {
    return (
      <div className="relative flex w-full items-center justify-center overflow-hidden select-none" style={{ fontSize: config.fontSize, minHeight: `${promptHeightEm(lines)}em` }}>
        <div className="flex items-center justify-center gap-3 py-[0.5em] text-center text-[14px] text-subtle">{emptyText}</div>
      </div>
    )
  }
  const Reading = config.direction === 'vertical' ? VerticalReading : HorizontalReading
  return <Reading texts={texts} current={current} config={config} lines={lines} onWordClick={onWordClick} pad={pad} />
}
