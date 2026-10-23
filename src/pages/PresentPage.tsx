import { ChevronLeft, ChevronRight, Maximize, Monitor, MonitorUp, MicOff, Pause, Play, RotateCcw, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, IconButton } from '../components/Button'
import { Kbd, Toggle } from '../components/controls'
import { FitBox } from '../components/FitBox'
import { toast } from '../components/Toast'
import { CopilotPanel } from '../features/copilot/CopilotPanel'
import { useCopilot } from '../features/copilot/useCopilot'
import { MicStatus } from '../features/speech/MicStatus'
import { ModelList } from '../features/speech/ModelList'
import { useSpeechEngine } from '../features/speech/useSpeechEngine'
import { useSettings } from '../features/settings/settingsStore'
import { SlideImage } from '../features/slides/SlideImage'
import { Teleprompter } from '../features/teleprompter/Teleprompter'
import { useCameraAnchor } from '../features/teleprompter/useCameraAnchor'
import { CommandMatcher } from '../services/alignment/commands'
import { SyncSession } from '../services/alignment/syncSession'
import { speech } from '../services/speech/speechService'
import { loadPresentation } from '../services/storage/projects'
import { platform } from '../platform'
import { errorMessage } from '../services/tauri'
import type { MonitorInfo, Presentation, ScriptWord, Settings, Slide, VoiceCommand } from '../types'
import { formatClock } from '../utils/format'
import { HOME } from '../utils/routes'

/** Width of the SI copilot panel beside the slide. */
const SIDE_PANEL_W = 360
/** Extra height of the browser's floating window when it also shows the copilot. */
const PIP_COPILOT_H = 220

const COMMAND_LABEL: Record<VoiceCommand, string> = {
  next: 'Next slide',
  previous: 'Previous slide',
  repeat: 'Restarting slide',
  pause: 'Paused',
  resume: 'Resumed',
}

/** Recent script context for optional recognizer biasing — only words already passed. */
function promptContext(words: ScriptWord[], wordIndex: number): string {
  const end = Math.max(0, wordIndex - 14)
  return words
    .slice(Math.max(0, end - 32), end)
    .map((w) => w.text)
    .join(' ')
}

export function PresentPage() {
  const { id = '' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const updateSettings = useSettings((s) => s.update)
  const tp = settings.teleprompter

  const [p, setP] = useState<Presentation | null>(null)
  const [slideIndex, setSlideIndex] = useState(() => Math.max(0, Number(search.get('slide') ?? 1) - 1))
  const [wordIndex, setWordIndex] = useState(0)
  const [spoken, setSpoken] = useState(false)
  const [atEnd, setAtEnd] = useState(false)
  const [paused, setPaused] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [showTranscript, setShowTranscript] = useState(tp.showTranscript)
  const [flash, setFlash] = useState<string | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [startedAt] = useState(() => Date.now())
  const session = useRef<SyncSession | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const engine = useSpeechEngine(!!p && voiceEnabled, settings.speech)
  const copilot = useCopilot(p, slideIndex, settings.speech.modelId)
  const [copilotOpen, setCopilotOpen] = useState(false)

  useEffect(() => {
    loadPresentation(id)
      .then((loaded) => {
        setP(loaded)
        setSlideIndex((i) => Math.min(i, loaded.slides.length - 1))
      })
      .catch((e) => {
        toast(errorMessage(e), 'error')
        navigate(HOME, { replace: true })
      })
  }, [id, navigate])

  const slide = p?.slides[slideIndex]
  const words = useMemo(() => slide?.words ?? [], [slide])
  const total = p?.slides.length ?? 0

  const voiceCommands = settings.voiceCommands
  const matcher = useMemo(() => (voiceCommands.enabled ? new CommandMatcher(voiceCommands.phrases) : null), [voiceCommands])

  // One sync session per presentation; swap scripts on slide change. The
  // session keeps its own paused flag (see setPausedBoth).
  useEffect(() => {
    if (!p) return
    if (!session.current) session.current = new SyncSession(words, null)
    else {
      session.current.setScript(words)
      speech.boundary()
    }
    setWordIndex(0)
    setSpoken(false)
    setAtEnd(false)
    setTranscript('')
  }, [p, words])

  useEffect(() => {
    if (session.current) session.current.commands = matcher
  }, [matcher, p])

  const showFlash = useCallback((text: string) => {
    setFlash(text)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 1400)
  }, [])

  const goTo = useCallback(
    (index: number) => {
      if (!p) return
      const next = Math.max(0, Math.min(p.slides.length - 1, index))
      setSlideIndex(next)
    },
    [p],
  )

  const restart = useCallback(() => {
    session.current?.restart()
    setWordIndex(0)
    setSpoken(false)
    setAtEnd(false)
  }, [])

  const setPausedBoth = useCallback((value: boolean) => {
    setPaused(value)
    if (session.current) session.current.paused = value
  }, [])

  const placeWord = useCallback((w: number) => {
    const s = session.current
    if (!s) return
    s.aligner.setWordIndex(w)
    setWordIndex(s.aligner.wordIndex)
    setSpoken(s.aligner.position >= 0)
    setAtEnd(s.aligner.atEnd)
  }, [])

  // Latest actions for event handlers registered once.
  const actions = useRef({ goTo, restart, setPausedBoth, showFlash, slideIndex, paused, atEnd })
  useLayoutEffect(() => {
    actions.current = { goTo, restart, setPausedBoth, showFlash, slideIndex, paused, atEnd }
  })

  const runCommand = useCallback((cmd: VoiceCommand) => {
    const a = actions.current
    a.showFlash(COMMAND_LABEL[cmd])
    if (cmd === 'next') a.goTo(a.slideIndex + 1)
    else if (cmd === 'previous') a.goTo(a.slideIndex - 1)
    else if (cmd === 'repeat') a.restart()
    else if (cmd === 'pause') a.setPausedBoth(true)
    else if (cmd === 'resume') a.setPausedBoth(false)
  }, [])

  // Recognizer -> alignment -> teleprompter.
  useEffect(() => {
    const unlisten = speech.onTranscript((e) => {
      const s = session.current
      if (!s) return
      const r = s.handle(e)
      ;(window as { __reflexTrace?: (t: object) => void }).__reflexTrace?.({ heard: r.text, word: s.aligner.wordIndex, end: s.aligner.atEnd, command: r.command, final: e.isFinal })
      if (r.command) {
        runCommand(r.command)
        return
      }
      setTranscript(r.text)
      if (r.outcome?.moved) {
        setWordIndex(s.aligner.wordIndex)
        setSpoken(true)
        setAtEnd(s.aligner.atEnd)
      }
    })
    return () => {
      unlisten.then((f) => f())
    }
  }, [runCommand])

  // Optional: bias recognition toward the script vocabulary (earlier words only).
  useEffect(() => {
    if (!settings.speech.biasWithScript || engine.status !== 'listening') return
    const t = setTimeout(() => speech.setPrompt(promptContext(words, wordIndex)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [words, wordIndex, settings.speech.biasWithScript, engine.status])

  // Keyboard (and presentation clickers, which send PageUp/PageDown) — in this
  // window and in the popped-out teleprompter.
  const pipRef = useRef<Window | null>(null)
  const [pipOpen, setPipOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      const a = actions.current
      const sc = settings.shortcuts
      const code = e.code
      if (code === sc.next || code === 'PageDown') a.goTo(a.slideIndex + 1)
      else if (code === sc.previous || code === 'PageUp') a.goTo(a.slideIndex - 1)
      else if (code === sc.togglePause) {
        a.setPausedBoth(!a.paused)
        a.showFlash(a.paused ? 'Resumed' : 'Paused')
      } else if (code === sc.restart) {
        a.restart()
        a.showFlash('Restarting slide')
      } else if (code === sc.exit) navigate(-1)
      else if (code === 'ArrowDown') placeWord(Math.min(words.length - 1, (session.current?.aligner.wordIndex ?? 0) + 1))
      else if (code === 'ArrowUp') placeWord((session.current?.aligner.wordIndex ?? 0) - 1)
      else if (code === 'KeyT') setShowTranscript((v) => !v)
      else if (code === 'KeyQ') setCopilotOpen((v) => !v)
      else return
      e.preventDefault()
    }
    const targets: Window[] = [window, ...(pipRef.current ? [pipRef.current] : [])]
    targets.forEach((t) => t.addEventListener('keydown', onKey))
    return () => targets.forEach((t) => t.removeEventListener('keydown', onKey))
  }, [settings.shortcuts, navigate, placeWord, words.length, pipOpen])

  // Optional auto-advance at the end of a slide's script.
  const [autoCountdown, setAutoCountdown] = useState(false)
  useEffect(() => {
    if (!settings.autoAdvance.enabled || !atEnd || paused || slideIndex >= total - 1) {
      setAutoCountdown(false)
      return
    }
    setAutoCountdown(true)
    const t = setTimeout(() => {
      setAutoCountdown(false)
      goTo(slideIndex + 1)
    }, settings.autoAdvance.delayMs)
    return () => clearTimeout(t)
  }, [atEnd, paused, settings.autoAdvance, slideIndex, total, goTo])

  // Display modes. "dual": slides on another display. "share": for video
  // calls — what you share shows only the deck, while the teleprompter lives
  // in a separate window you don't share (browser: a floating
  // picture-in-picture window; desktop: a floating strip under the camera).
  // `?mode=share` ("Present on a call") overrides the saved presenter mode.
  const modeParam = search.get('mode')
  const mode: Settings['display']['mode'] =
    modeParam === 'share' || modeParam === 'window' || modeParam === 'fullscreen' || modeParam === 'dual' ? modeParam : settings.display.mode
  const web = platform.kind === 'web'
  const [slidesWindow, setSlidesWindow] = useState<null | 'share' | 'display'>(null)
  const [shareStage, setShareStage] = useState<'setup' | 'live'>('setup')
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  // Browser call mode: show the SI copilot under the floating teleprompter.
  const [copilotInPip, setCopilotInPip] = useState(true)
  const engineOk = engine.status !== 'missing-model' && engine.status !== 'error'
  const shareLive = mode === 'share' && shareStage === 'live'
  const compact = shareLive && !web && engineOk
  const compactH = Math.round(tp.fontSize * 1.94 + 40 + (showTranscript ? 22 : 0))

  const openSlidesWindow = useCallback(
    async (share: boolean, monitorIndex: number | null = settings.display.audienceMonitor) => {
      if (!p) return false
      try {
        const external = await platform.windows.openSlides(p.id, { monitorIndex, share })
        setSlidesWindow(share ? 'share' : 'display')
        platform.windows.sendSlide(actions.current.slideIndex)
        return external
      } catch (e) {
        toast(errorMessage(e), 'error')
        return false
      }
    },
    [p, settings.display.audienceMonitor],
  )

  const closeSlidesWindow = useCallback(() => {
    void platform.windows.closeSlides()
    setSlidesWindow(null)
  }, [])

  useEffect(() => {
    if (!p) return
    const fullscreen = mode === 'fullscreen'
    if (fullscreen) void platform.windows.setFullscreen(true)
    return () => {
      if (fullscreen) void platform.windows.setFullscreen(false)
      void platform.windows.closeSlides()
    }
  }, [p, mode, openSlidesWindow])

  useEffect(() => platform.windows.onSlidesClosed(() => setSlidesWindow(null)), [])
  useEffect(() => {
    if (slidesWindow) platform.windows.sendSlide(slideIndex)
  }, [slideIndex, slidesWindow])
  useEffect(() => platform.windows.onSlidesReady(() => platform.windows.sendSlide(actions.current.slideIndex)), [])

  /** Start presenting to a video call (needs a click: pop-ups and PiP require one). */
  const startShare = useCallback(async () => {
    if (web) {
      const dpip = (window as Window & { documentPictureInPicture?: { requestWindow(o: object): Promise<Window> } }).documentPictureInPicture
      if (dpip) {
        try {
          // The PiP window's own title bar takes ~90 px; ask for enough room
          // for the strip, then correct to the exact size once it exists.
          const pipH = compactH + (copilotInPip ? PIP_COPILOT_H : 0)
          const w = await dpip.requestWindow({ width: Math.round(Math.min(screen.width * (tp.width / 100), 1400)), height: pipH + 96 })
          try {
            const chromeH = w.outerHeight - w.innerHeight
            if (Math.abs(w.innerHeight - pipH) > 4) w.resizeTo(w.outerWidth, pipH + chromeH)
          } catch {
            // resizing needs a user gesture in some browsers; the extra height is fine
          }
          for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) w.document.head.appendChild(node.cloneNode(true))
          w.document.documentElement.className = 'dark'
          w.document.title = 'Reflex — Teleprompter'
          w.document.body.style.cssText = 'margin:0;background:#0b0b0e;overflow:hidden;height:100vh'
          w.addEventListener('pagehide', () => {
            setPipWindow(null)
            setShareStage('setup')
          })
          setPipWindow(w)
          setShareStage('live')
          return
        } catch (e) {
          toast(`Could not pop out the teleprompter: ${errorMessage(e)}`, 'error')
        }
      }
      // No picture-in-picture (Safari / Firefox): share a slides-only window instead.
      if (await openSlidesWindow(true)) setShareStage('live')
      return
    }
    if (await openSlidesWindow(true)) setShareStage('live')
  }, [web, tp.width, compactH, copilotInPip, openSlidesWindow])

  useEffect(() => {
    pipRef.current = pipWindow
    setPipOpen(!!pipWindow)
    return () => pipWindow?.close()
  }, [pipWindow])

  // Second-display ("Presenter Console") flow: pick the audience display,
  // put the slides there fullscreen, keep the console on this screen.
  const [displayStage, setDisplayStage] = useState<'setup' | 'live'>('setup')
  const [monitors, setMonitors] = useState<MonitorInfo[]>([])
  useEffect(() => {
    if (mode !== 'dual') return
    platform.windows.listMonitors().then(setMonitors).catch(() => setMonitors([]))
  }, [mode])

  const startDualDisplay = useCallback(
    async (monitorIndex: number | null) => {
      await platform.windows.setFullscreen(true)
      await openSlidesWindow(false, monitorIndex)
      setDisplayStage('live')
    },
    [openSlidesWindow],
  )
  useEffect(() => {
    if (mode !== 'dual' || displayStage !== 'live') return
    return () => {
      void platform.windows.setFullscreen(false)
      void platform.windows.closeSlides()
    }
  }, [mode, displayStage])
  // If the audience window is closed (user or OS), drop back to setup.
  useEffect(() => {
    if (mode === 'dual' && displayStage === 'live' && slidesWindow === null) setDisplayStage('setup')
  }, [mode, displayStage, slidesWindow])

  // Desktop: shrink this window into a floating strip under the camera while
  // the slides window fills the screen.
  useEffect(() => {
    if (!compact || !platform.windows.setPresenterCompact) return
    void platform.windows.setPresenterCompact(true, Math.round(screen.width * (tp.width / 100)), compactH)
    return () => void platform.windows.setPresenterCompact?.(false, 0, 0)
  }, [compact, tp.width, compactH])

  // Layout: strip under the camera (or a top / bottom bar), slide below.
  const camera = tp.position === 'camera'
  const anchor = useCameraAnchor(camera)
  const stripRef = useRef<HTMLDivElement>(null)
  const [stripH, setStripH] = useState(0)
  const [viewportW, setViewportW] = useState(() => window.innerWidth)
  useLayoutEffect(() => {
    const el = stripRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setStripH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [p, tp.position])
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Controls fade out while presenting and come back on mouse movement.
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (!settings.display.autoHideControls) {
      setIdle(false)
      return
    }
    let t: ReturnType<typeof setTimeout>
    const wake = () => {
      setIdle(false)
      clearTimeout(t)
      t = setTimeout(() => setIdle(true), 2500)
    }
    wake()
    window.addEventListener('mousemove', wake)
    window.addEventListener('mousedown', wake)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('mousedown', wake)
    }
  }, [settings.display.autoHideControls])

  if (!p || !slide) return <div className="h-full bg-black" />

  const highlight = tp.highlightTarget === 'next' && spoken ? Math.min(wordIndex + 1, words.length - 1) : wordIndex
  const isLast = slideIndex === total - 1
  const dual = !!slidesWindow
  const nextSlide = p.slides[slideIndex + 1]

  const stripBg = `color-mix(in srgb, #0b0b0e ${Math.round(tp.opacity * 100)}%, transparent)`
  // Floats on the strip's edge so it never shifts the slide or covers words.
  const chips = (paused || atEnd) && (
    <div
      className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center gap-2 ${
        tp.position === 'bottom' ? 'bottom-full translate-y-1/2' : 'top-full -translate-y-1/2'
      }`}
    >
      {paused && <Chip tone="muted">Paused</Chip>}
      {atEnd && !paused && (
        <Chip tone="accent">{isLast ? 'End of presentation' : autoCountdown ? 'Next slide…' : <>End of slide · say “Next” or press →</>}</Chip>
      )}
    </div>
  )
  const prompter = (
    <>
      <Teleprompter
        words={words}
        current={highlight}
        config={tp}
        onWordClick={placeWord}
        pad={camera ? 4 : 28}
        emptyText="No script for this slide — add one in the editor"
      />
      {showTranscript && (
        <div className="selectable truncate pb-2 text-center text-[12px] text-subtle" title="What the speech engine heard">
          {transcript || '…'}
        </div>
      )}
    </>
  )

  // Camera strip: a floating panel centred on the camera, just below it.
  const camW = Math.min(viewportW - 24, Math.max(360, (viewportW * tp.width) / 100))
  const camLeft = Math.max(12, Math.min(viewportW - camW - 12, anchor.centerX - camW / 2))
  const camTop = anchor.top + 6

  const strip = camera ? (
    <div ref={stripRef} className="absolute z-20" style={{ top: camTop, left: camLeft, width: camW }}>
      <div
        className="rounded-[20px] border border-white/[0.08] px-4 shadow-[0_18px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        style={{ background: stripBg }}
      >
        {prompter}
      </div>
      {chips}
    </div>
  ) : (
    <div ref={stripRef} className={`absolute inset-x-0 z-20 ${tp.position === 'top' ? 'top-0' : 'bottom-0'}`}>
      <div
        className={`relative ${tp.position === 'top' ? 'shadow-[0_10px_40px_rgba(0,0,0,0.55)]' : 'border-t border-white/[0.07]'}`}
        style={{ background: stripBg }}
      >
        {/* The top bar is the default layout: an accent edge makes it easy to find at a glance. */}
        {tp.position === 'top' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-accent/80 to-transparent" />
        )}
        <div className="mx-auto" style={{ width: `${tp.width}%` }}>
          {prompter}
        </div>
      </div>
      {chips}
    </div>
  )

  const padTop = camera ? camTop + stripH + 14 : tp.position === 'top' ? stripH + 14 : 28
  const padBottom = tp.position === 'bottom' ? stripH + 14 : 56
  const controlsHidden = idle && engine.status !== 'error' && engine.status !== 'missing-model' && !(mode === 'share' && !shareLive)
  const stripChip =
    paused ? 'Paused' : atEnd ? (isLast ? 'End of presentation' : autoCountdown ? 'Next slide…' : 'End of slide · say “Next” or press →') : null

  // The floating teleprompter: desktop compact window or browser PiP window.
  const floating = (
    <FloatingStrip
      prompter={prompter}
      chip={stripChip}
      slideLabel={`${slideIndex + 1} / ${total}`}
      paused={paused}
      onPrev={() => goTo(slideIndex - 1)}
      onNext={() => goTo(slideIndex + 1)}
      onTogglePause={() => setPausedBoth(!paused)}
      onExit={() => navigate(-1)}
      extra={pipWindow && copilotInPip ? <CopilotPanel copilot={copilot} variant="strip" /> : undefined}
      promptH={compactH}
    />
  )

  if (compact) return floating

  if (mode === 'dual' && engine.status !== 'missing-model' && displayStage === 'setup') {
    return (
      <DisplaySetup
        web={web}
        monitors={monitors}
        onStart={startDualDisplay}
        onUseWindowShare={() => {
          setDisplayStage('setup')
          navigate(`/present/${p.id}?slide=${slideIndex + 1}&mode=share`, { replace: true })
        }}
        onCancel={() => navigate(-1)}
      />
    )
  }

  if (mode === 'dual' && displayStage === 'live') {
    return (
      <PresenterConsole
        prompter={prompter}
        slide={slide}
        nextSlide={nextSlide}
        notes={slide.notes}
        aspectRatio={p.aspectRatio}
        slideIndex={slideIndex}
        total={total}
        isLast={isLast}
        paused={paused}
        statusChip={stripChip}
        startedAt={startedAt}
        engineStatus={engine.status}
        engineMessage={engine.message}
        showLevel={settings.display.showLevelMeter}
        device={engine.device}
        onRetry={engine.retry}
        onPrev={() => goTo(slideIndex - 1)}
        onNext={() => goTo(slideIndex + 1)}
        onTogglePause={() => setPausedBoth(!paused)}
        onRestart={restart}
        onExit={() => navigate(-1)}
        copilot={copilotOpen ? <CopilotPanel copilot={copilot} variant="side" onClose={() => setCopilotOpen(false)} /> : null}
        copilotOpen={copilotOpen}
        onToggleCopilot={() => setCopilotOpen((v) => !v)}
      />
    )
  }

  // In browser share mode the tab itself is what the audience sees: deck only.
  const deckOnly = web && shareLive && !!pipWindow
  const sidePanel = copilotOpen && !deckOnly

  return (
    <div className={`dark relative h-full overflow-hidden bg-black text-fg ${controlsHidden ? 'cursor-none' : ''}`}>
      {pipWindow && createPortal(floating, pipWindow.document.body)}
      {!deckOnly && strip}

      <div
        className="absolute inset-0 flex items-center justify-center gap-6 px-6"
        style={deckOnly ? { padding: 0 } : { paddingTop: padTop, paddingBottom: padBottom, paddingRight: sidePanel ? SIDE_PANEL_W + 40 : undefined }}
        data-tauri-drag-region
      >
        <div className={`flex h-full min-w-0 items-center justify-center ${dual && !deckOnly ? 'flex-[3]' : 'w-full'}`}>
          <FitBox ratio={p.aspectRatio}>
            <div className={`h-full w-full overflow-hidden ${deckOnly ? '' : 'rounded-lg shadow-2xl shadow-black'}`}>
              <SlideImage slide={slide} aspectRatio={p.aspectRatio} className="h-full w-full" />
            </div>
          </FitBox>
        </div>
        {dual && !deckOnly && (
          <aside className="flex h-full min-w-[220px] flex-1 flex-col gap-3 overflow-hidden">
            <div className="text-[11.5px] font-medium tracking-wide text-subtle uppercase">Next</div>
            {nextSlide ? (
              <div className="overflow-hidden rounded-md ring-1 ring-line">
                <SlideImage slide={nextSlide} aspectRatio={p.aspectRatio} thumb />
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-line py-6 text-center text-[12px] text-subtle">End of presentation</div>
            )}
            {slide.notes && (
              <>
                <div className="mt-2 text-[11.5px] font-medium tracking-wide text-subtle uppercase">Notes</div>
                <p className="selectable min-h-0 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-line text-muted">{slide.notes}</p>
              </>
            )}
          </aside>
        )}
      </div>

      {sidePanel && (
        <aside
          className="absolute right-4 z-30 overflow-hidden rounded-2xl border border-line-strong bg-elevated/95 shadow-2xl shadow-black/60 backdrop-blur-xl animate-rise"
          style={{ top: Math.max(16, padTop - 14), bottom: padBottom - 8, width: SIDE_PANEL_W }}
        >
          <CopilotPanel copilot={copilot} variant="side" onClose={() => setCopilotOpen(false)} />
        </aside>
      )}

      {mode === 'share' && !shareLive && engine.status !== 'missing-model' && (
        <ShareSetup
          web={web}
          pipSupported={web && 'documentPictureInPicture' in window}
          copilot={copilotInPip}
          onCopilotChange={setCopilotInPip}
          onStart={startShare}
          onCancel={() => navigate(-1)}
        />
      )}
      {flash && !deckOnly && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-full bg-elevated/90 px-4 py-1.5 text-[13px] font-medium shadow-xl backdrop-blur animate-rise">
          {flash}
        </div>
      )}
      {engine.status === 'missing-model' && (
        <ModelSetup
          selected={settings.speech.modelId}
          onSelect={(modelId) => updateSettings('speech', { modelId })}
          onRetry={engine.retry}
          onManual={() => setVoiceEnabled(false)}
        />
      )}

      <footer
        className={`absolute inset-x-0 bottom-0 z-20 flex h-12 items-center gap-4 bg-gradient-to-t from-black via-black/90 to-transparent px-4 text-muted transition-opacity duration-300 ${
          controlsHidden || deckOnly ? 'pointer-events-none opacity-0' : 'opacity-100'
        } ${tp.position === 'bottom' ? 'hidden' : ''}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <MicStatus status={engine.status} paused={paused} device={engine.device} showLevel={settings.display.showLevelMeter} />
          {engine.status === 'error' && (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[12px] text-danger" title={engine.message}>
                {engine.message}
              </span>
              <Button size="sm" onClick={engine.retry}>
                Retry
              </Button>
            </span>
          )}
          {!voiceEnabled && (
            <Button size="sm" variant="ghost" icon={<MicOff size={13} />} onClick={() => setVoiceEnabled(true)}>
              Enable voice sync
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <IconButton label="Previous slide (←)" onClick={() => goTo(slideIndex - 1)} disabled={slideIndex === 0}>
            <ChevronLeft size={18} />
          </IconButton>
          <span className="min-w-[96px] text-center text-[13px] font-medium text-fg tabular">
            Slide {slideIndex + 1} <span className="text-subtle">/ {total}</span>
          </span>
          <IconButton label="Next slide (→)" onClick={() => goTo(slideIndex + 1)} disabled={isLast}>
            <ChevronRight size={18} />
          </IconButton>
        </div>

        <div className="flex flex-1 items-center justify-end gap-1">
          <IconButton label={paused ? 'Resume sync (Space)' : 'Pause sync (Space)'} active={paused} onClick={() => setPausedBoth(!paused)}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </IconButton>
          <IconButton label="Restart slide (R)" onClick={restart}>
            <RotateCcw size={15} />
          </IconButton>
          <IconButton label="SI copilot — answers to questions on the call (Q)" active={copilotOpen} onClick={() => setCopilotOpen((v) => !v)}>
            <Sparkles size={15} />
          </IconButton>
          <IconButton
            label={slidesWindow ? 'Close slides window' : 'Open a slides-only window (to share or put on a projector)'}
            active={!!slidesWindow}
            onClick={() => (slidesWindow ? closeSlidesWindow() : void openSlidesWindow(true))}
          >
            <MonitorUp size={15} />
          </IconButton>
          {web && (
            <IconButton label="Fullscreen" onClick={() => void platform.windows.setFullscreen(!document.fullscreenElement)}>
              <Maximize size={15} />
            </IconButton>
          )}
          <Clock startedAt={startedAt} />
          <IconButton label="Exit (Esc)" onClick={() => navigate(-1)}>
            <X size={17} />
          </IconButton>
        </div>
      </footer>
    </div>
  )
}

/** Compact teleprompter for the floating window (desktop) or PiP window (browser). */
function FloatingStrip({
  prompter,
  chip,
  slideLabel,
  paused,
  onPrev,
  onNext,
  onTogglePause,
  onExit,
  extra,
  promptH,
}: {
  prompter: React.ReactNode
  chip: string | null
  slideLabel: string
  paused: boolean
  onPrev: () => void
  onNext: () => void
  onTogglePause: () => void
  onExit: () => void
  /** Shown under the teleprompter (the SI copilot in the browser's floating window). */
  extra?: ReactNode
  promptH: number
}) {
  return (
    <div className="dark group relative flex h-screen w-full flex-col overflow-hidden bg-[#0b0b0e] text-fg" data-tauri-drag-region>
      {/* Slim top row: status on the left, controls on the right (on hover). */}
      <div className="flex h-6 shrink-0 items-center justify-between px-3 pt-1" data-tauri-drag-region>
        <span className="truncate text-[11px] font-medium text-accent/90">{chip ?? ''}</span>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="mr-1 text-[11px] text-subtle tabular">{slideLabel}</span>
          <IconButton label="Previous slide" size="sm" className="!h-5 !w-5" onClick={onPrev}>
            <ChevronLeft size={13} />
          </IconButton>
          <IconButton label="Next slide" size="sm" className="!h-5 !w-5" onClick={onNext}>
            <ChevronRight size={13} />
          </IconButton>
          <IconButton label={paused ? 'Resume' : 'Pause'} size="sm" className="!h-5 !w-5" active={paused} onClick={onTogglePause}>
            {paused ? <Play size={11} /> : <Pause size={11} />}
          </IconButton>
          <IconButton label="Exit" size="sm" className="!h-5 !w-5" onClick={onExit}>
            <X size={12} />
          </IconButton>
        </div>
      </div>
      <div className={`flex min-h-0 items-center px-4 pb-2 ${extra ? 'shrink-0' : 'flex-1'}`} style={extra ? { height: promptH - 24 } : undefined}>
        <div className="min-w-0 flex-1">{prompter}</div>
      </div>
      {extra && <div className="min-h-0 flex-1 border-t border-white/[0.07]">{extra}</div>}
    </div>
  )
}

/** Explains how to share only the deck, then starts on a click. */
function ShareSetup({
  web,
  pipSupported,
  copilot,
  onCopilotChange,
  onStart,
  onCancel,
}: {
  web: boolean
  pipSupported: boolean
  copilot: boolean
  onCopilotChange: (on: boolean) => void
  onStart: () => void
  onCancel: () => void
}) {
  const steps = web
    ? pipSupported
      ? [
          'Click Start. The teleprompter pops out into a small floating window — drag it right under your camera.',
          'This tab then shows only your deck. In Google Meet choose Share screen → “A tab” (Zoom / Teams: share this browser tab).',
          'Your audience sees just the slides. The floating teleprompter is a separate window, so it is not part of the tab you share.',
        ]
      : [
          'Click Start. A slides-only window opens (allow pop-ups if asked).',
          'In Google Meet, Zoom or Teams share that window — “Reflex — Slides”.',
          'Keep this tab with the teleprompter on your screen; it is not shared.',
        ]
    : [
        'Click Start. Your slides fill the screen in their own window and the teleprompter floats just under your camera.',
        'In Google Meet, Zoom or Teams choose Share → Window → “Reflex — Slides (share this window)” — not “Entire screen”.',
        'Your audience sees only that window: the slides. The teleprompter floating on top of it is a separate window and is not shared. Use ← → or say “Next”; Esc to finish.',
      ]
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-8 backdrop-blur-sm animate-fade-in">
      <div className="w-[600px] max-w-full rounded-2xl border border-line-strong bg-elevated p-6 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <MonitorUp size={18} className="text-accent" />
          <h2 className="text-[17px] font-semibold tracking-tight">Present to a video call</h2>
        </div>
        <ol className="mt-4 flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-muted">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[12px] leading-relaxed text-subtle">
          Sharing your entire screen shows every window on it, including the teleprompter — share the {web && pipSupported ? 'tab' : 'slides window'} instead.
        </p>
        {web && pipSupported && (
          <label className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3">
            <Toggle checked={copilot} onChange={onCopilotChange} label="SI copilot in the floating window" />
            <span className="text-[12.5px] leading-relaxed text-muted">
              <span className="font-medium text-fg">SI copilot in the floating window</span> — listens to the call and suggests answers to questions, right
              under your script.
            </span>
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" data-autofocus onClick={onStart}>
            Start
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Pre-flight for second-display presenting: choose the audience display. */
function DisplaySetup({
  web,
  monitors,
  onStart,
  onUseWindowShare,
  onCancel,
}: {
  web: boolean
  monitors: MonitorInfo[]
  onStart: (monitorIndex: number | null) => void
  onUseWindowShare: () => void
  onCancel: () => void
}) {
  const others = monitors.filter((m) => !m.isCurrent)
  const [pick, setPick] = useState<number | null>(others[0]?.index ?? null)
  const hasSecond = others.length > 0
  const dims = (m: MonitorInfo) => `${Math.round(m.width / m.scaleFactor)}×${Math.round(m.height / m.scaleFactor)}`

  return (
    <div className="dark flex h-full items-center justify-center overflow-y-auto bg-[#08080a] p-8 text-fg">
      <div className="w-[620px] max-w-full rounded-2xl border border-line-strong bg-elevated p-6 shadow-2xl animate-rise">
        <div className="flex items-center gap-2.5">
          <Monitor size={18} className="text-accent" />
          <h2 className="text-[17px] font-semibold tracking-tight">Present with a second display</h2>
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          Your slides go full-screen on the audience display; this screen keeps the teleprompter, notes and controls — only for you. Share the
          audience display (or its window) and the script never appears to anyone else.
        </p>

        {hasSecond ? (
          <>
            <div className="mt-5 text-[11.5px] font-medium tracking-wide text-subtle uppercase">Audience display</div>
            <div className="mt-2 flex flex-col gap-2">
              {others.map((m) => (
                <button
                  key={m.index}
                  type="button"
                  onClick={() => setPick(m.index)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                    pick === m.index ? 'border-accent/60 bg-accent-soft' : 'border-line bg-surface hover:bg-hover'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Monitor size={16} className={pick === m.index ? 'text-accent' : 'text-muted'} />
                    <span>
                      <span className="block text-[13.5px] font-medium">{m.name || `Display ${m.index + 1}`}</span>
                      <span className="block text-[12px] text-subtle tabular">{dims(m)}</span>
                    </span>
                  </span>
                  <span className={`h-4 w-4 rounded-full border ${pick === m.index ? 'border-accent bg-accent' : 'border-line-strong'}`} />
                </button>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between">
              <button type="button" onClick={onUseWindowShare} className="text-[12.5px] text-muted hover:text-fg">
                Share a window instead
              </button>
              <div className="flex gap-2">
                <Button onClick={onCancel}>Cancel</Button>
                <Button variant="primary" data-autofocus onClick={() => onStart(pick)}>
                  Start on {others.find((m) => m.index === pick)?.name || 'display 2'}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-muted">
              <p className="font-medium text-fg">Only one display detected.</p>
              <p className="mt-1.5">To keep the script fully off the audience's view, add a second screen, then come back:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Connect an external monitor or projector, or</li>
                <li>
                  Use an iPad as a display with <span className="text-fg">Sidecar</span> — Control Center → Screen Mirroring → your iPad → <span className="text-fg">Use as Separate Display</span>.
                </li>
              </ul>
              <p className="mt-2">
                Prefer a single screen? <button type="button" onClick={onUseWindowShare} className="font-medium text-accent hover:underline">Share just the slides window</button> instead — the audience still sees only the deck.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <button type="button" onClick={() => onStart(null)} className="text-[12.5px] text-muted hover:text-fg">
                {web ? 'Open slides in a separate window anyway' : 'Open the slides window here anyway'}
              </button>
              <div className="flex gap-2">
                <Button onClick={onCancel}>Cancel</Button>
                <Button variant="primary" data-autofocus onClick={onUseWindowShare}>
                  Share a window instead
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** The presenter's private screen in second-display mode. */
function PresenterConsole({
  prompter,
  slide,
  nextSlide,
  notes,
  aspectRatio,
  slideIndex,
  total,
  isLast,
  paused,
  statusChip,
  startedAt,
  engineStatus,
  engineMessage,
  showLevel,
  device,
  onRetry,
  onPrev,
  onNext,
  onTogglePause,
  onRestart,
  onExit,
  copilot,
  copilotOpen,
  onToggleCopilot,
}: {
  prompter: React.ReactNode
  slide: Slide
  nextSlide: Slide | undefined
  notes: string
  aspectRatio: number
  slideIndex: number
  total: number
  isLast: boolean
  paused: boolean
  statusChip: string | null
  startedAt: number
  engineStatus: string
  engineMessage: string
  showLevel: boolean
  device: string
  onRetry: () => void
  onPrev: () => void
  onNext: () => void
  onTogglePause: () => void
  onRestart: () => void
  onExit: () => void
  copilot: ReactNode
  copilotOpen: boolean
  onToggleCopilot: () => void
}) {
  return (
    <div className="dark flex h-full flex-col bg-[#08080a] text-fg">
      {/* Teleprompter — the reason this screen exists. */}
      <div className="relative shrink-0 border-b border-white/[0.07] bg-[#0b0b0e] px-6 py-3">
        <div className="mx-auto max-w-[1100px]">{prompter}</div>
        {statusChip && (
          <span className="pointer-events-none absolute top-2 right-4 rounded-full border border-accent/30 bg-[#2a170b] px-2.5 py-0.5 text-[11px] font-medium text-accent">
            {statusChip}
          </span>
        )}
      </div>

      {/* Current slide, next slide, notes. */}
      <div className="flex min-h-0 flex-1 gap-5 p-6">
        <div className="flex min-w-0 flex-[3] flex-col">
          <div className="mb-2 text-[11.5px] font-medium tracking-wide text-subtle uppercase">Current slide</div>
          <div className="min-h-0 flex-1">
            <FitBox ratio={aspectRatio}>
              <div className="h-full w-full overflow-hidden rounded-lg shadow-2xl shadow-black ring-1 ring-line">
                <SlideImage slide={slide} aspectRatio={aspectRatio} className="h-full w-full" />
              </div>
            </FitBox>
          </div>
        </div>
        <div className="flex min-w-[240px] flex-[2] flex-col gap-4 overflow-hidden">
          <div>
            <div className="mb-2 text-[11.5px] font-medium tracking-wide text-subtle uppercase">Next</div>
            {nextSlide ? (
              <div className="overflow-hidden rounded-md ring-1 ring-line">
                <SlideImage slide={nextSlide} aspectRatio={aspectRatio} thumb />
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-line py-8 text-center text-[12px] text-subtle">End of presentation</div>
            )}
          </div>
          <div className={`flex min-h-0 flex-col ${copilot ? 'max-h-[30%] shrink-0' : 'flex-1'}`}>
            <div className="mb-2 text-[11.5px] font-medium tracking-wide text-subtle uppercase">Notes</div>
            <p className="selectable min-h-0 flex-1 overflow-y-auto text-[13.5px] leading-relaxed whitespace-pre-line text-muted">
              {notes || <span className="text-subtle italic">No notes for this slide.</span>}
            </p>
          </div>
          {copilot && <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-elevated">{copilot}</div>}
        </div>
      </div>

      {/* Controls. */}
      <footer className="flex h-14 shrink-0 items-center gap-4 border-t border-line bg-app/95 px-4 text-muted">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <MicStatus status={engineStatus as never} paused={paused} device={device} showLevel={showLevel} />
          {engineStatus === 'error' && (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[12px] text-danger" title={engineMessage}>
                {engineMessage}
              </span>
              <Button size="sm" onClick={onRetry}>
                Retry
              </Button>
            </span>
          )}
          <span className="hidden text-[12px] text-subtle lg:inline">Audience sees the slides only · share that display or its window</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Previous slide (←)" onClick={onPrev} disabled={slideIndex === 0}>
            <ChevronLeft size={18} />
          </IconButton>
          <span className="min-w-[96px] text-center text-[14px] font-medium text-fg tabular">
            Slide {slideIndex + 1} <span className="text-subtle">/ {total}</span>
          </span>
          <IconButton label="Next slide (→)" onClick={onNext} disabled={isLast}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
        <div className="flex flex-1 items-center justify-end gap-1">
          <IconButton label={paused ? 'Resume sync (Space)' : 'Pause sync (Space)'} active={paused} onClick={onTogglePause}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </IconButton>
          <IconButton label="Restart slide (R)" onClick={onRestart}>
            <RotateCcw size={15} />
          </IconButton>
          <IconButton label="SI copilot (Q)" active={copilotOpen} onClick={onToggleCopilot}>
            <Sparkles size={15} />
          </IconButton>
          <Clock startedAt={startedAt} />
          <IconButton label="Exit (Esc)" onClick={onExit}>
            <X size={17} />
          </IconButton>
        </div>
      </footer>
    </div>
  )
}

function Chip({ children, tone }: { children: React.ReactNode; tone: 'accent' | 'muted' }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[12px] font-medium whitespace-nowrap animate-fade-in ${
        tone === 'accent' ? 'border border-accent/30 bg-[#2a170b] text-accent' : 'border border-line-strong bg-elevated text-muted'
      }`}
    >
      {children}
    </span>
  )
}

function Clock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  return <span className="mx-2 w-14 text-right text-[13px] font-medium text-fg tabular">{formatClock(now - startedAt)}</span>
}

function ModelSetup({
  selected,
  onSelect,
  onRetry,
  onManual,
}: {
  selected: string
  onSelect: (id: string) => void
  onRetry: () => void
  onManual: () => void
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm animate-fade-in">
      <div className="w-[560px] max-w-full rounded-2xl border border-line-strong bg-elevated p-6 shadow-2xl">
        <h2 className="text-[17px] font-semibold tracking-tight">Set up local speech recognition</h2>
        <p className="mt-1.5 text-[13px] text-muted">
          Reflex follows your voice with a Whisper model that runs entirely on this computer. Download one once — no account, no cloud.
        </p>
        <div className="mt-5">
          <ModelList
            compact
            selected={selected}
            onSelect={(id) => {
              onSelect(id)
              onRetry()
            }}
          />
        </div>
        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={onManual} className="text-[12.5px] text-muted hover:text-fg">
            Present without voice sync
          </button>
          <div className="flex items-center gap-2 text-[12px] text-subtle">
            Use <Kbd>→</Kbd> <Kbd>↓</Kbd> to advance manually
            <Button size="sm" variant="primary" onClick={onRetry}>
              Start
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
