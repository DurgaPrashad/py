import { AlertTriangle, ArrowLeft, Pencil, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { TitleBar } from '../components/TitleBar'
import { ConfidenceBadge } from '../features/slides/ConfidenceBadge'
import { SlideImage } from '../features/slides/SlideImage'
import { importPresentation, type ImportProgress } from '../services/parser/importer'
import { savePresentation, withWords } from '../services/storage/projects'
import { errorMessage } from '../services/tauri'
import type { Presentation, Slide } from '../types'
import { HOME } from '../utils/routes'

export function ImportPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [search] = useSearchParams()
  const path = (location.state as { path?: string } | null)?.path ?? search.get('path') ?? undefined
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [slides, setSlides] = useState<Slide[]>([])
  const [presentation, setPresentation] = useState<Presentation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!path) {
      navigate(HOME, { replace: true })
      return
    }
    if (started.current) return
    started.current = true
    importPresentation(path, (p) => {
      setProgress(p)
      if (p.slide) setSlides((s) => [...s, p.slide!])
    })
      .then((p) => {
        setPresentation(p)
        setSlides(p.slides)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [path, navigate])

  const updateScript = (index: number, script: string) => {
    const next = slides.map((s, i) => (i === index ? withWords({ ...s, script }) : s))
    setSlides(next)
    if (presentation) {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => savePresentation({ ...presentation, slides: next }), 500)
    }
  }

  const fileName = path?.split(/[\\/]/).pop() ?? ''
  const done = !!presentation
  const pct = progress && progress.total ? Math.round((progress.current / progress.total) * 100) : 0
  const lowConfidence = slides.filter((s) => s.extraction.method !== 'none' && s.extraction.method !== 'manual' && s.extraction.confidence < 0.75).length

  const finish = async (to: 'edit' | 'present') => {
    if (!presentation) return
    clearTimeout(saveTimer.current)
    await savePresentation({ ...presentation, slides })
    navigate(to === 'edit' ? `/edit/${presentation.id}` : `/present/${presentation.id}`, { replace: true })
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar
        left={
          <>
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={() => navigate(HOME)}>
              Presentations
            </Button>
            <span className="truncate text-[13px] text-muted">{fileName}</span>
          </>
        }
        right={
          done && (
            <>
              <Button size="sm" icon={<Pencil size={13} />} onClick={() => finish('edit')}>
                Open editor
              </Button>
              <Button size="sm" variant="primary" icon={<Play size={12} fill="currentColor" />} onClick={() => finish('present')}>
                Start presenting
              </Button>
            </>
          )
        }
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1060px] px-8 pt-8 pb-16">
          {error ? (
            <div className="mt-16 flex flex-col items-center text-center">
              <AlertTriangle className="text-danger" size={26} />
              <h2 className="mt-4 text-[17px] font-semibold">Import failed</h2>
              <p className="selectable mt-2 max-w-md text-[13.5px] text-muted">{error}</p>
              <Button className="mt-6" onClick={() => navigate(HOME)}>
                Back to presentations
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between gap-6">
                <div className="min-w-0">
                  <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em]">
                    {done ? presentation.name : 'Importing presentation'}
                  </h1>
                  <p className="mt-1 text-[13px] text-muted">
                    {done
                      ? `${slides.length} slides detected. Review the speaking script for each slide — replace it with exactly what you want to say.`
                      : progress?.message ?? 'Preparing…'}
                  </p>
                </div>
                {done && lowConfidence > 0 && (
                  <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-warning">
                    <AlertTriangle size={14} /> {lowConfidence} slide{lowConfidence > 1 ? 's' : ''} need review
                  </span>
                )}
              </div>
              {!done && (
                <div className="mt-5 h-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-300"
                    style={{ width: `${progress?.stage === 'converting' ? 8 : Math.max(4, pct)}%` }}
                  />
                </div>
              )}

              <ol className="mt-8 flex flex-col gap-3">
                {slides.map((s, i) => (
                  <li key={s.id} className="grid grid-cols-[220px_1fr] gap-5 rounded-2xl border border-line bg-surface p-4 animate-rise">
                    <div>
                      <div className="overflow-hidden rounded-lg border border-line">
                        <SlideImage slide={s} aspectRatio={presentation?.aspectRatio ?? 16 / 9} thumb />
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[12.5px] font-semibold tracking-wide text-muted">SLIDE {s.slideNumber}</span>
                        <ConfidenceBadge extraction={s.extraction} compact />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-3">
                      <div>
                        <div className="text-[11.5px] font-medium tracking-wide text-subtle uppercase">Detected slide text</div>
                        <p className="selectable mt-1 line-clamp-3 text-[13px] whitespace-pre-line text-muted">
                          {s.extractedText || <span className="text-subtle italic">{s.extraction.note ?? 'No text detected'}</span>}
                        </p>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex items-center justify-between">
                          <div className="text-[11.5px] font-medium tracking-wide text-subtle uppercase">Speaking script</div>
                          {s.notes && s.script === s.notes && <span className="text-[11.5px] text-subtle">From speaker notes</span>}
                        </div>
                        <textarea
                          value={s.script}
                          disabled={!done}
                          onChange={(e) => updateScript(i, e.target.value)}
                          placeholder="Type or paste exactly what you want to say on this slide…"
                          rows={3}
                          className="mt-1 min-h-[76px] w-full resize-y rounded-lg border border-line bg-app px-3 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-subtle focus:border-accent/60 disabled:opacity-70"
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
