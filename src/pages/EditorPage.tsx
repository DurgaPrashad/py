import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Eraser,
  Loader2,
  MonitorUp,
  Play,
  Plus,
  Save,
  ScanText,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, IconButton } from '../components/Button'
import { Kbd } from '../components/controls'
import { Modal } from '../components/Modal'
import { TitleBar } from '../components/TitleBar'
import { toast } from '../components/Toast'
import { useAccount } from '../features/account/account'
import { deckContext, runCopilot } from '../features/copilot/api'
import { useSettings } from '../features/settings/settingsStore'
import { ConfidenceBadge } from '../features/slides/ConfidenceBadge'
import { SlideImage } from '../features/slides/SlideImage'
import { reextractSlide } from '../services/parser/importer'
import { textToScript } from '../services/parser/script'
import { newBlankSlide } from '../services/parser/slides'
import { estimateMs, loadPresentation, savePresentation, withWords } from '../services/storage/projects'
import { platform } from '../platform'
import { errorMessage } from '../services/tauri'
import type { Presentation, Slide } from '../types'
import { formatDuration } from '../utils/format'
import { HOME } from '../utils/routes'

type SaveState = 'saved' | 'dirty' | 'saving'

export function EditorPage() {
  const { id = '' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const wpm = useSettings((s) => s.settings.wordsPerMinute)
  const [p, setP] = useState<Presentation | null>(null)
  const [index, setIndex] = useState(() => Math.max(0, Number(search.get('slide') ?? 1) - 1))
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [extracting, setExtracting] = useState<null | 'auto' | 'ocr'>(null)
  const [drafting, setDrafting] = useState(false)
  const signedIn = useAccount((s) => !!s.session)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const latest = useRef<Presentation | null>(null)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadPresentation(id)
      .then((loaded) => {
        latest.current = loaded
        setP(loaded)
        setIndex((i) => Math.min(i, loaded.slides.length - 1))
      })
      .catch((e) => {
        toast(errorMessage(e), 'error')
        navigate(HOME, { replace: true })
      })
  }, [id, navigate])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const current = latest.current
    if (!current || !dirty.current) return
    dirty.current = false
    setSaveState('saving')
    try {
      const saved = await savePresentation(current)
      if (latest.current === current) latest.current = saved
      setSaveState(dirty.current ? 'dirty' : 'saved')
    } catch (e) {
      dirty.current = true
      setSaveState('dirty')
      toast(`Could not save: ${errorMessage(e)}`, 'error')
    }
  }, [])

  // Save when leaving the editor.
  useEffect(() => () => void flush(), [flush])

  const commit = (next: Presentation) => {
    latest.current = next
    dirty.current = true
    setP(next)
    setSaveState('dirty')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 800)
  }

  const updateSlide = (i: number, patch: Partial<Slide>) => {
    if (!p) return
    const slides = p.slides.map((s, k) => {
      if (k !== i) return s
      const merged = { ...s, ...patch }
      return 'script' in patch ? withWords(merged) : merged
    })
    commit({ ...p, slides })
  }

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.max(0, Math.min((p?.slides.length ?? 1) - 1, i + delta)))
    },
    [p],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        flush()
      } else if ((mod || e.altKey) && (e.key === 'ArrowDown' || e.key === ']')) {
        e.preventDefault()
        go(1)
      } else if ((mod || e.altKey) && (e.key === 'ArrowUp' || e.key === '[')) {
        e.preventDefault()
        go(-1)
      } else if (e.key === 'PageDown') go(1)
      else if (e.key === 'PageUp') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flush, go])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [index])

  if (!p) return <div className="h-full bg-app" />
  const slide = p.slides[index]
  const words = slide.words.length

  const extract = async (mode: 'auto' | 'ocr') => {
    setExtracting(mode)
    try {
      const res = await reextractSlide(p, index, mode, slide.image ? await platform.resolveAssetUrl(slide.image) : '')
      updateSlide(index, { extractedText: res.text, extraction: res.extraction })
      toast(res.text ? 'Slide text updated' : 'No text found on this slide', res.text ? 'success' : 'info')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setExtracting(null)
    }
  }

  const draftWithAi = async () => {
    const source = [slide.extractedText, slide.notes].filter((t) => t.trim()).join('\n\n')
    if (!source) {
      toast('Add slide text or notes first — the AI writes the script from them.', 'info')
      return
    }
    setDrafting(true)
    try {
      const res = await runCopilot(useSettings.getState().settings.si, 'script', source, deckContext(p, index))
      updateSlide(index, { script: res.text })
      toast(res.si ? 'Script drafted — edit it to sound like you.' : `Script drafted. ${res.free_left} free SI answers left.`, 'success')
      if (!res.si) void useAccount.getState().refresh().catch(() => null)
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setDrafting(false)
    }
  }

  const addSlide = () => {
    const slides = [...p.slides]
    slides.splice(index + 1, 0, newBlankSlide(index + 1))
    commit({ ...p, slides: slides.map((s, i) => ({ ...s, slideNumber: i + 1 })) })
    setIndex(index + 1)
  }

  const deleteSlide = () => {
    if (p.slides.length <= 1) return
    const slides = p.slides.filter((_, i) => i !== index).map((s, i) => ({ ...s, slideNumber: i + 1 }))
    commit({ ...p, slides })
    setIndex(Math.min(index, slides.length - 1))
    setConfirmDelete(false)
  }

  const totalWords = p.slides.reduce((n, s) => n + s.words.length, 0)

  return (
    <div className="flex h-full flex-col">
      <TitleBar
        left={
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={14} />}
              onClick={async () => {
                await flush()
                navigate(HOME)
              }}
            >
              Presentations
            </Button>
            <input
              value={p.name}
              onChange={(e) => commit({ ...p, name: e.target.value })}
              onBlur={() => !p.name.trim() && commit({ ...p, name: 'Untitled presentation' })}
              aria-label="Presentation name"
              className="h-7 min-w-0 max-w-[340px] flex-1 rounded-md bg-transparent px-2 text-[13.5px] font-medium outline-none hover:bg-hover focus:bg-hover"
            />
          </>
        }
        right={
          <>
            <span className="mr-2 text-[12px] text-subtle">
              {saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved changes' : 'All changes saved'}
            </span>
            <span className="mr-2 hidden text-[12px] text-subtle lg:inline">
              {p.slides.length} slides · ~{formatDuration(estimateMs(totalWords, wpm))}
            </span>
            <Button
              size="sm"
              icon={<MonitorUp size={13} />}
              title="Teleprompter in its own window; share only the slides on Meet, Zoom or Teams"
              onClick={async () => {
                await flush()
                navigate(`/present/${p.id}?slide=${index + 1}&mode=share`)
              }}
            >
              Present on a call
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Play size={12} fill="currentColor" />}
              onClick={async () => {
                await flush()
                navigate(`/present/${p.id}?slide=${index + 1}`)
              }}
            >
              Present
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        {/* LEFT: slide thumbnails */}
        <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-surface/40">
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {p.slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                data-index={i}
                onClick={() => setIndex(i)}
                className={`group mb-1.5 flex w-full items-start gap-2.5 rounded-xl p-1.5 text-left transition-colors ${
                  i === index ? 'bg-accent-soft' : 'hover:bg-hover'
                }`}
              >
                <span className={`w-5 pt-0.5 text-right text-[11.5px] font-medium tabular ${i === index ? 'text-accent' : 'text-subtle'}`}>
                  {s.slideNumber}
                </span>
                <span
                  className={`relative block flex-1 overflow-hidden rounded-md border ${i === index ? 'border-accent/70' : 'border-line'}`}
                >
                  <SlideImage slide={s} aspectRatio={p.aspectRatio} thumb />
                  {!s.script.trim() && (
                    <span title="No script yet" className="absolute top-1 right-1 h-2 w-2 rounded-full bg-warning ring-2 ring-black/30" />
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-line p-3">
            <Button size="sm" variant="ghost" className="w-full" icon={<Plus size={14} />} onClick={addSlide}>
              Add slide
            </Button>
          </div>
        </aside>

        {/* RIGHT: preview, detected text, script */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5 px-8 py-6">
            <div className="flex justify-center rounded-2xl bg-stage/60 p-4">
              <div className="w-full max-w-[640px] overflow-hidden rounded-lg shadow-2xl shadow-black/40 ring-1 ring-line">
                <SlideImage slide={slide} aspectRatio={p.aspectRatio} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1">
                <IconButton label="Previous slide" onClick={() => go(-1)} disabled={index === 0}>
                  <ChevronLeft size={17} />
                </IconButton>
                <span className="min-w-[88px] text-center text-[13px] font-medium tabular">
                  Slide {index + 1} <span className="text-subtle">/ {p.slides.length}</span>
                </span>
                <IconButton label="Next slide" onClick={() => go(1)} disabled={index === p.slides.length - 1}>
                  <ChevronRight size={17} />
                </IconButton>
              </div>
              <div className="mx-1 h-5 w-px bg-line" />
              <Button size="sm" icon={extracting === 'auto' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} disabled={!!extracting} onClick={() => extract('auto')}>
                Auto Extract Text
              </Button>
              <Button size="sm" variant="ghost" icon={extracting === 'ocr' ? <Loader2 size={13} className="animate-spin" /> : <ScanText size={13} />} disabled={!!extracting || !slide.image} onClick={() => extract('ocr')}>
                Run OCR
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<ClipboardCopy size={13} />}
                disabled={!slide.extractedText.trim()}
                onClick={() => updateSlide(index, { script: textToScript(slide.extractedText) })}
              >
                Use slide text as script
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                disabled={drafting || !signedIn}
                title={signedIn ? 'Write a speaking script for this slide with AI (SI)' : 'Sign in to draft scripts with AI'}
                onClick={draftWithAi}
              >
                Draft with AI
              </Button>
              <Button size="sm" variant="ghost" icon={<Eraser size={13} />} disabled={!slide.script} onClick={() => updateSlide(index, { script: '' })}>
                Clear Script
              </Button>
              <div className="flex-1" />
              <IconButton label="Delete slide" disabled={p.slides.length <= 1} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} />
              </IconButton>
              <Button size="sm" icon={<Save size={13} />} onClick={flush} disabled={saveState === 'saved'}>
                Save
              </Button>
            </div>

            <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5">
              <section className="flex min-w-0 flex-col">
                <div className="mb-1.5 flex h-6 items-center justify-between">
                  <h3 className="text-[11.5px] font-medium tracking-wide text-subtle uppercase">Extracted slide text</h3>
                  <ConfidenceBadge extraction={slide.extraction} />
                </div>
                <textarea
                  value={slide.extractedText}
                  onChange={(e) =>
                    updateSlide(index, {
                      extractedText: e.target.value,
                      extraction: { ...slide.extraction, note: 'Corrected by you', confidence: 1 },
                    })
                  }
                  placeholder={slide.extraction.note ?? 'No text detected on this slide.'}
                  className="min-h-[220px] flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-muted outline-none placeholder:text-subtle focus:border-accent/50 focus:text-fg"
                />
                {slide.extraction.confidence < 0.75 && slide.extraction.method === 'ocr' && (
                  <p className="mt-2 text-[12px] text-warning">Low-confidence OCR. Check this text before using it as a script.</p>
                )}
              </section>

              <section className="flex min-w-0 flex-col">
                <div className="mb-1.5 flex h-6 items-center justify-between">
                  <h3 className="text-[11.5px] font-medium tracking-wide text-subtle uppercase">Speaking script</h3>
                  <span className="text-[12px] text-subtle tabular">
                    {words} words{words ? ` · ~${formatDuration(estimateMs(words, wpm))}` : ''}
                  </span>
                </div>
                <textarea
                  value={slide.script}
                  onChange={(e) => updateSlide(index, { script: e.target.value })}
                  placeholder="Type or paste exactly what you want to say on this slide. This is what the teleprompter follows."
                  className="min-h-[220px] flex-1 resize-none rounded-xl border border-line-strong bg-surface px-4 py-3 text-[15px] leading-[1.65] text-fg outline-none placeholder:text-subtle focus:border-accent/70"
                />
              </section>
            </div>

            <section>
              <h3 className="mb-1.5 text-[11.5px] font-medium tracking-wide text-subtle uppercase">Notes</h3>
              <textarea
                value={slide.notes}
                onChange={(e) => updateSlide(index, { notes: e.target.value })}
                placeholder="Private notes (not used by the teleprompter)"
                rows={3}
                className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-subtle focus:border-accent/50"
              />
            </section>

            <section>
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="text-[11.5px] font-medium tracking-wide text-subtle uppercase">Q&A prep notes</h3>
                <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">
                  <Sparkles size={10} /> SI copilot
                </span>
              </div>
              <textarea
                value={p.qaNotes ?? ''}
                onChange={(e) => commit({ ...p, qaNotes: e.target.value })}
                placeholder="For the whole presentation: facts the SI copilot can use when someone asks a question — traction, revenue, team, pricing, competitors, your raise and use of funds, common objections and how you answer them."
                rows={5}
                className="w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-subtle focus:border-accent/50"
              />
            </section>

            <p className="flex items-center gap-1.5 text-[11.5px] text-subtle">
              <Kbd>⌘S</Kbd> save <span className="mx-1">·</span> <Kbd>⌥↑</Kbd> <Kbd>⌥↓</Kbd> previous / next slide
            </p>
          </div>
        </main>
      </div>

      <Modal
        open={confirmDelete}
        title={`Delete slide ${index + 1}?`}
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" data-autofocus onClick={deleteSlide}>
              Delete slide
            </Button>
          </>
        }
      >
        The slide and its script are removed from this presentation.
      </Modal>
    </div>
  )
}
