import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ScriptWord, Settings } from '../../types'

interface Props {
  words: ScriptWord[]
  /** Display index of the highlighted word. */
  current: number
  config: Settings['teleprompter']
  onWordClick?: (index: number) => void
  emptyText?: string
  /** Horizontal breathing room inside the strip, px. */
  pad?: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** First word of the N-word window, keeping `current` near the centre. */
export function windowStart(current: number, total: number, visible: number): number {
  return clamp(current - Math.floor((visible - 1) / 2), 0, Math.max(0, total - visible))
}

/**
 * The teleprompter strip. Exactly `wordsVisible` words are visible at any
 * time. All words of the slide sit on one track; moving the window slides
 * the track (GPU transform) while words leaving the window fade out and
 * words entering fade in, so progress feels continuous rather than jumpy.
 */
export function Teleprompter({ words, current, config, onWordClick, emptyText = 'No script for this slide', pad: PAD = 28 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [width, setWidth] = useState(0)
  const [fontPx, setFontPx] = useState(config.fontSize)
  const [layout, setLayout] = useState({ offset: 0, pillLeft: 0, pillWidth: 0, ready: false })
  const [animate, setAnimate] = useState(false)

  const N = Math.max(1, Math.round(config.wordsVisible))
  const total = words.length
  const idx = clamp(current, 0, Math.max(0, total - 1))
  const start = windowStart(idx, total, N)
  const end = Math.min(total, start + N)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    // The strip may be rendered into another window (picture-in-picture);
    // observe with that window's own ResizeObserver.
    const win = (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis
    const ro = new win.ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // New slide / new sizing: start from the configured size and jump (no
  // animation) to the right place.
  useLayoutEffect(() => {
    setFontPx(config.fontSize)
    setAnimate(false)
  }, [words, config.fontSize, N, width])

  // Shrink the font if the widest N-word window would not fit.
  useLayoutEffect(() => {
    if (!width || total === 0) return
    const els = wordRefs.current
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
  }, [width, fontPx, total, N, words, PAD])

  // Position the track so the window is aligned in the strip.
  useLayoutEffect(() => {
    const els = wordRefs.current
    const a = els[start]
    const b = els[end - 1]
    const c = els[idx]
    if (!a || !b || !width) return
    const left = a.offsetLeft
    const right = b.offsetLeft + b.offsetWidth
    let offset: number
    if (config.align === 'left') offset = PAD - left
    else if (config.align === 'right') offset = width - PAD - right
    else offset = (width - (right - left)) / 2 - left
    setLayout({ offset, pillLeft: c?.offsetLeft ?? 0, pillWidth: c?.offsetWidth ?? 0, ready: true })
  }, [start, end, idx, fontPx, width, config.align, words, PAD])

  // Re-enable transitions on the frame after a jump.
  useLayoutEffect(() => {
    if (animate || !layout.ready) return
    const win = containerRef.current?.ownerDocument.defaultView ?? window
    const id = win.requestAnimationFrame(() => win.requestAnimationFrame(() => setAnimate(true)))
    return () => win.cancelAnimationFrame(id)
  }, [animate, layout.ready])

  const ms = animate ? config.transitionMs : 0
  const ease = 'cubic-bezier(0.22, 0.8, 0.24, 1)'
  const style = config.highlightStyle
  const texts = useMemo(() => words.map((w) => (config.uppercase ? w.text.toUpperCase() : w.text)), [words, config.uppercase])

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden select-none"
      style={{ fontSize: fontPx }}
    >
      {total === 0 ? (
        <div className="py-[0.42em] text-center text-[0.55em] text-subtle">{emptyText}</div>
      ) : (
        <div
          className="relative flex w-max py-[0.38em] whitespace-nowrap will-change-transform"
          style={{
            transform: `translate3d(${layout.offset}px,0,0)`,
            transition: `transform ${ms}ms ${ease}`,
            opacity: layout.ready ? 1 : 0,
          }}
        >
          {(style === 'pill' || style === 'underline') && (
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: layout.pillLeft - (style === 'pill' ? 0.16 * fontPx : 0),
                width: layout.pillWidth + (style === 'pill' ? 0.32 * fontPx : 0),
                top: style === 'pill' ? '0.22em' : 'auto',
                bottom: style === 'pill' ? '0.22em' : '0.2em',
                height: style === 'underline' ? Math.max(3, fontPx * 0.07) : undefined,
                borderRadius: style === 'pill' ? fontPx * 0.22 : 99,
                background: style === 'pill' ? 'var(--app-accent-soft)' : 'var(--app-accent)',
                boxShadow: style === 'pill' ? 'inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 35%, transparent)' : 'none',
                transition: `left ${ms}ms ${ease}, width ${ms}ms ${ease}`,
              }}
            />
          )}
          {texts.map((text, i) => {
            const visible = i >= start && i < end
            const isCurrent = i === idx
            const spoken = i < idx
            let color = 'var(--app-fg)'
            let opacity = visible ? 1 : 0
            if (visible && spoken && config.dimSpoken) opacity = style === 'bold' ? 0.38 : 0.42
            if (visible && !spoken && !isCurrent && style === 'bold') opacity = 0.62
            if (isCurrent && style !== 'bold' && style !== 'underline') color = 'var(--app-accent)'
            return (
              <span
                key={i}
                ref={(el) => {
                  wordRefs.current[i] = el
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
      )}
    </div>
  )
}
