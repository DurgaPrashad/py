import { useLayoutEffect, useRef, useState } from 'react'
import { tokenizeScript } from '../../services/alignment/normalize'
import type { HighlightStyle, ScriptWord } from '../../types'

export interface AnswerLayout {
  /** All words, in reading order — what the voice aligner follows. */
  words: ScriptWord[]
  lines: { bullet: boolean; from: number; to: number }[]
}

/** Amounts, percentages and counts: "$1.5M", "50%", "18", "1,200". */
const FIGURE = /^[([]?[$€£₹]?\d[\d,.]*(?:%|[kKmMbB]n?|x)?[)\],.;:]*$/

/** Splits an answer into lines (keeping "• " bullets) and readable words. */
export function answerLayout(answer: string): AnswerLayout {
  const words: ScriptWord[] = []
  const lines: AnswerLayout['lines'] = []
  for (const raw of answer.split('\n')) {
    const line = raw.trim()
    const bullet = /^[•\-*]\s+/.test(line)
    const lineWords = tokenizeScript(line.replace(/^[•\-*]\s+/, ''))
    if (!lineWords.length) continue
    lines.push({ bullet, from: words.length, to: words.length + lineWords.length })
    words.push(...lineWords)
  }
  return { words, lines }
}

/**
 * An answer with the teleprompter's highlight: a pill (or underline, colour,
 * bold) that moves to the word being read, across wrapped lines.
 * `current` is -1 before reading starts (the first word is marked faintly).
 */
export function AnswerText({
  layout,
  current,
  style,
  fontSize,
  transitionMs,
  emphasize = false,
}: {
  layout: AnswerLayout
  current: number
  style: HighlightStyle
  fontSize: number
  transitionMs: number
  /** Make figures (amounts, percentages, counts) stand out. */
  emphasize?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const refs = useRef<(HTMLSpanElement | null)[]>([])
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [width, setWidth] = useState(0)
  const started = current >= 0
  const idx = Math.max(0, Math.min(current, layout.words.length - 1))

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const win = (el.ownerDocument.defaultView ?? window) as Window & typeof globalThis
    const ro = new win.ResizeObserver((entries) => setWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = refs.current[idx]
    setRect(el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null)
  }, [idx, layout, fontSize, width])

  const ease = 'cubic-bezier(0.22, 0.8, 0.24, 1)'
  const pad = fontSize * 0.18
  return (
    <div ref={box} className="relative text-fg" style={{ fontSize, lineHeight: 1.6 }}>
      {rect && (style === 'pill' || style === 'underline') && (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: rect.left - (style === 'pill' ? pad : 0),
            top: style === 'pill' ? rect.top + rect.height * 0.08 : rect.top + rect.height - Math.max(2, fontSize * 0.12),
            width: rect.width + (style === 'pill' ? pad * 2 : 0),
            height: style === 'pill' ? rect.height * 0.84 : Math.max(2, fontSize * 0.1),
            borderRadius: style === 'pill' ? fontSize * 0.3 : 99,
            background: style === 'pill' ? 'var(--app-accent-soft)' : 'var(--app-accent)',
            boxShadow: style === 'pill' ? 'inset 0 0 0 1px color-mix(in srgb, var(--app-accent) 35%, transparent)' : 'none',
            opacity: started ? 1 : 0.45,
            transition: `left ${transitionMs}ms ${ease}, top ${transitionMs}ms ${ease}, width ${transitionMs}ms ${ease}, opacity 200ms ease`,
          }}
        />
      )}
      {layout.lines.map((line) => (
        <div key={line.from} className={line.bullet ? 'flex gap-[0.45em]' : ''}>
          {line.bullet && <span className="text-subtle">•</span>}
          <span>
            {layout.words.slice(line.from, line.to).map((w, k) => {
              const i = line.from + k
              const isCurrent = started && i === idx
              const spoken = started && i < idx
              const figure = emphasize && FIGURE.test(w.text)
              return (
                <span key={i}>
                  <span
                    ref={(el) => {
                      refs.current[i] = el
                    }}
                    className="relative"
                    style={{
                      color: isCurrent && (style === 'pill' || style === 'color') ? 'var(--app-accent)' : figure ? '#fdba74' : undefined,
                      fontWeight: isCurrent && style === 'bold' ? 700 : figure ? 600 : undefined,
                      opacity: spoken ? 0.5 : style === 'bold' && started && !isCurrent ? 0.75 : 1,
                      transition: 'opacity 160ms ease, color 90ms ease',
                    }}
                  >
                    {w.text}
                  </span>{' '}
                </span>
              )
            })}
          </span>
        </div>
      ))}
    </div>
  )
}
