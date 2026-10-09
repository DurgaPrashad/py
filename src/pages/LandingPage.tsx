import {
  ArrowRight,
  Download,
  FileText,
  Laptop,
  Lock,
  Mic,
  MonitorUp,
  MousePointerClick,
  ScanText,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { DEFAULT_SETTINGS } from '../features/settings/defaults'
import { Teleprompter } from '../features/teleprompter/Teleprompter'
import { tokenizeScript } from '../services/alignment/normalize'

const REPO = 'https://github.com/DurgaPrashad/presenter'

function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

interface Release {
  version: string
  file: string
  arch: string
  bytes: number
  built: string
}

const PREVIEW_SCRIPT =
  'Today I want to show you how we are building the operating infrastructure for global Voice AI, with more than 150,000 verifiable calls.'

/** Public front page of the hosted site. The app itself lives at #/app. */
export function LandingPage() {
  const [release, setRelease] = useState<Release | null>(null)
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent)

  useEffect(() => {
    document.title = 'Reflex Presenter — a teleprompter that follows your voice'
    fetch('downloads/latest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then(setRelease)
      .catch(() => setRelease(null))
  }, [])

  return (
    <div className="dark h-full overflow-y-auto bg-[#08080a] text-fg">
      <nav className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#08080a]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="text-[14px] font-semibold tracking-tight">Reflex Presenter</span>
          </div>
          <div className="hidden items-center gap-7 text-[13px] text-muted md:flex">
            <a href="#how" onClick={scrollTo('how')} className="hover:text-fg">
              How it works
            </a>
            <a href="#calls" onClick={scrollTo('calls')} className="hover:text-fg">
              Presenting on calls
            </a>
            <a href="#download" onClick={scrollTo('download')} className="hover:text-fg">
              Download
            </a>
            <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-fg">
              GitHub
            </a>
          </div>
          <Link
            to="/app"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-[13px] font-medium text-accent-fg hover:brightness-110"
          >
            Open web app <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(ellipse_at_center,rgba(255,138,61,0.18),transparent_65%)]" />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-muted">
            <Sparkles size={13} className="text-accent" /> Local AI · no account · no cloud speech
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-[44px] leading-[1.05] font-semibold tracking-[-0.035em] md:text-[60px]">
            Your script, right under your camera.
            <span className="text-accent"> Following your voice.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-muted">
            Import a PDF or PowerPoint, write what you want to say for each slide, and present. Reflex listens on your device and moves an
            eight-word teleprompter along as you speak — even when you pause, repeat yourself or skip a line.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/app"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-medium text-accent-fg hover:brightness-110"
            >
              Open in the browser <ArrowRight size={16} />
            </Link>
            <a
              href="#download"
              onClick={scrollTo('download')}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-5 text-[14px] font-medium hover:bg-white/[0.08]"
            >
              <Download size={16} /> Download for Mac
            </a>
          </div>

          <HeroPreview />
        </div>
      </header>

      {/* How it works */}
      <Section id="how" eyebrow="How it works" title="From deck to delivery in three steps">
        <div className="grid gap-4 md:grid-cols-3">
          <Step icon={<FileText size={18} />} n={1} title="Import your deck">
            PDF, PPTX or PPT. Every slide is rendered, its text extracted in reading order — with OCR for text inside images — and a confidence
            score shown.
          </Step>
          <Step icon={<ScanText size={18} />} n={2} title="Write what you'll say">
            Each slide gets its own speaking script. Start from the speaker notes or the slide text, or paste exactly the words you want.
          </Step>
          <Step icon={<Mic size={18} />} n={3} title="Present naturally">
            Local Whisper recognition follows you word by word. Fillers, pauses, repeats and skipped words don't break it. Say “Next” to move on.
          </Step>
        </div>
      </Section>

      {/* Calls */}
      <Section id="calls" eyebrow="Google Meet · Zoom · Teams" title="Your audience sees the slides. The script stays with you.">
        <p className="mx-auto -mt-4 mb-10 max-w-2xl text-center text-[15px] leading-relaxed text-muted">
          Use <span className="text-fg">Present on a call</span>. Reflex puts the slides and the teleprompter in separate places — then you share
          only the slides.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <CallCard icon={<MonitorUp size={18} />} title="In the browser (Chrome or Edge)">
            <li>Open your deck and click <b>Present on a call</b>, then <b>Start</b>.</li>
            <li>The teleprompter pops out into a small floating window — drag it just under your camera.</li>
            <li>
              In Meet: <b>Share screen → A tab</b> → choose the <b>Reflex Presenter</b> tab. (Zoom / Teams: share that browser tab.)
            </li>
            <li>The tab shows only your deck, so that's all the call sees.</li>
          </CallCard>
          <CallCard icon={<Laptop size={18} />} title="In the Mac app">
            <li>Open your deck and click <b>Present on a call</b>, then <b>Start</b>.</li>
            <li>The slides fill the screen and the teleprompter floats under your camera in its own small window.</li>
            <li>
              In Meet, Zoom or Teams: <b>Share → Window</b> → <b>Reflex — Slides (share this window)</b>.
            </li>
            <li>The call sees only that window: your slides. The floating text box on top of it is its own window, so it isn't part of the share.</li>
          </CallCard>
        </div>
        <div className="mx-auto mt-6 flex max-w-3xl items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3.5 text-[13.5px] leading-relaxed text-amber-100/90">
          <MousePointerClick size={17} className="mt-0.5 shrink-0 text-amber-300" />
          <p>
            Pick the <b>tab</b> or the <b>slides window</b> when you share — not “Entire screen”. Window and tab sharing send only that
            window, even with the teleprompter floating over it on your screen. Sharing the entire screen sends everything on it, including the
            teleprompter — Reflex never hides windows from screen capture.
          </p>
        </div>
      </Section>

      {/* Privacy */}
      <Section id="privacy" eyebrow="Private by design" title="Nothing you say leaves your computer">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature icon={<Mic size={18} />} title="On-device speech">
            Whisper runs on your GPU — WebGPU in the browser, Metal in the Mac app. No speech API, no recordings uploaded.
          </Feature>
          <Feature icon={<Lock size={18} />} title="Your files stay local">
            Decks and scripts live in your browser's storage or on your disk. There is no account and no server-side database.
          </Feature>
          <Feature icon={<Sparkles size={18} />} title="Works offline">
            After the one-time model download, the Mac app works without internet, and the web app keeps the model cached.
          </Feature>
        </div>
      </Section>

      {/* Download */}
      <Section id="download" eyebrow="Mac app" title="Download Reflex Presenter for Mac">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold">
                <Laptop size={18} className="text-accent" /> Reflex Presenter for macOS
              </div>
              <p className="mt-1.5 text-[13px] text-muted">
                {release
                  ? `Version ${release.version} · Apple Silicon (M1 and later) · ${Math.max(1, Math.round(release.bytes / 1e6))} MB · built ${release.built}`
                  : 'Apple Silicon (M1 and later), macOS 11 or newer'}
              </p>
              {!isMac && <p className="mt-1.5 text-[12.5px] text-subtle">You're not on a Mac — use the web app, or build the desktop app from source.</p>}
            </div>
            {release ? (
              <a
                href={`downloads/${release.file}`}
                download
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-medium text-accent-fg hover:brightness-110"
              >
                <Download size={16} /> Download .zip
              </a>
            ) : (
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-white/12 px-5 text-[14px] font-medium hover:bg-white/[0.06]"
              >
                <GithubMark /> Build from source
              </a>
            )}
          </div>
          <ol className="mt-7 grid gap-3 border-t border-white/[0.07] pt-6 text-[13.5px] leading-relaxed text-muted md:grid-cols-3">
            <li>
              <b className="text-fg">1. Install.</b> Unzip and drag <b>Reflex Presenter</b> into Applications.
            </li>
            <li>
              <b className="text-fg">2. First launch.</b> The app isn't notarized by Apple yet, so macOS blocks it once. Open{' '}
              <b>System Settings → Privacy & Security</b> and click <b>Open Anyway</b>.
            </li>
            <li>
              <b className="text-fg">3. Present.</b> Allow the microphone, download a speech model once (Base, 142 MB), and you're set — offline.
            </li>
          </ol>
          <p className="mt-4 text-[12px] text-subtle">
            Prefer Terminal? <code className="rounded bg-white/[0.06] px-1.5 py-0.5">xattr -dr com.apple.quarantine "/Applications/Reflex Presenter.app"</code>
          </p>
        </div>
      </Section>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-[12.5px] text-subtle md:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={18} /> Reflex Presenter — local-first AI teleprompter
          </div>
          <div className="flex items-center gap-5">
            <Link to="/app" className="hover:text-fg">
              Web app
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-fg">
              Source on GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function scrollTo(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/** Illustration of the presenting view (an animated preview, not live speech). */
function HeroPreview() {
  const words = useMemo(() => tokenizeScript(PREVIEW_SCRIPT), [])
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % words.length), 380)
    return () => clearInterval(t)
  }, [words.length])
  const config = { ...DEFAULT_SETTINGS.teleprompter, fontSize: 30 }
  return (
    <div className="relative mx-auto mt-14 max-w-4xl">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.01] p-2 shadow-[0_30px_120px_rgba(0,0,0,0.6)]">
        <div className="relative overflow-hidden rounded-xl bg-black">
          <div className="absolute top-0 left-1/2 h-4 w-24 -translate-x-1/2 rounded-b-xl bg-[#1a1a1e]" aria-hidden />
          <div className="mx-auto mt-6 w-[78%] rounded-2xl border border-white/[0.08] bg-[#0b0b0e]/90 px-3 shadow-xl">
            <Teleprompter words={words} current={i} config={config} pad={4} />
          </div>
          <div className="mx-6 mt-4 mb-6 flex aspect-[16/7.5] flex-col justify-center rounded-lg bg-[#f6f5f1] px-[8%] text-left">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-700 uppercase">Business model</p>
            <p className="mt-2 text-[clamp(16px,3vw,30px)] leading-tight font-bold tracking-tight text-neutral-900">
              Building the operating infrastructure for global Voice AI
            </p>
            <p className="mt-3 text-[clamp(11px,1.4vw,14px)] text-neutral-500">150,000+ directly verifiable AI calls</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-subtle">Preview. While you present, the highlight follows your voice.</p>
    </div>
  )
}

function Section({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-white/[0.05]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-center text-[12px] font-semibold tracking-[0.18em] text-accent uppercase">{eyebrow}</p>
        <h2 className="mx-auto mt-3 mb-10 max-w-3xl text-center text-[30px] leading-tight font-semibold tracking-[-0.025em] md:text-[36px]">
          {title}
        </h2>
        {children}
      </div>
    </section>
  )
}

function Step({ icon, n, title, children }: { icon: ReactNode; n: number; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
        <span className="text-[12px] font-medium text-subtle">Step {n}</span>
      </div>
      <h3 className="mt-4 text-[16px] font-semibold">{title}</h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{children}</p>
    </div>
  )
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-fg">{icon}</span>
      <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{children}</p>
    </div>
  )
}

function CallCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="flex items-center gap-2.5 text-[15px] font-semibold">
        <span className="text-accent">{icon}</span> {title}
      </div>
      <ol className="mt-4 flex list-decimal flex-col gap-2.5 pl-5 text-[13.5px] leading-relaxed text-muted marker:text-subtle [&_b]:font-semibold [&_b]:text-fg">
        {children}
      </ol>
    </div>
  )
}
