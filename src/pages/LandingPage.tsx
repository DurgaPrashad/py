import {
  ArrowRight,
  Briefcase,
  Check,
  Download,
  Eye,
  FileText,
  Headphones,
  Laptop,
  Lock,
  Mic,
  MonitorUp,
  Presentation,
  Rocket,
  ScanText,
  Sparkles,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_SETTINGS } from '../features/settings/defaults'
import { Teleprompter } from '../features/teleprompter/Teleprompter'
import { tokenizeScript } from '../services/alignment/normalize'
import { PLANS, TRIAL_DAYS } from '../config'
import { PricingTable } from './site/Pricing'
import { PrimaryLink, SecondaryLink, SiteShell } from './site/SiteShell'

interface Release {
  version: string
  file: string
  arch: string
  bytes: number
  built: string
}

const PREVIEW_SCRIPT =
  'Today I want to show you how we are building the operating infrastructure for global Voice AI, with more than 150,000 verifiable calls.'

/** Public front page of the website. The app itself lives at /app. */
export function LandingPage() {
  return (
    <SiteShell>
      <Hero />
      <StatBand />
      <Features />
      <CopilotSection />
      <HowItWorks />
      <UseCases />
      <CallsSection />
      <section id="pricing" className="scroll-mt-16 border-t border-slate-200 bg-slate-50/70">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading eyebrow="Pricing" title="Unlimited teleprompting from $4 a month">
            Standard (non-SI) is everything you need to deliver your own script. SI adds the AI copilot for live questions.
          </SectionHeading>
          <PricingTable />
        </div>
      </section>
      <DownloadSection />
      <Faq />
      <FinalCta />
    </SiteShell>
  )
}

function Hero() {
  return (
    <header className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_right,rgb(226_232_240)_1px,transparent_1px),linear-gradient(to_bottom,rgb(226_232_240)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-orange-200/40 blur-3xl" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
        <a
          href="#copilot"
          className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 py-1 pr-3 pl-1 text-[13px] text-slate-700 shadow-sm"
        >
          <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[11.5px] font-semibold text-white">New</span>
          SI copilot answers the questions you didn't rehearse <ArrowRight size={13} />
        </a>
        <h1 className="mx-auto mt-7 max-w-4xl text-[40px] leading-[1.04] font-semibold tracking-[-0.04em] text-slate-900 sm:text-[64px]">
          Pitch like you've rehearsed it <span className="text-orange-600">a hundred times.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-slate-600 sm:text-[18px]">
          Reflex puts your script right under your camera and moves it as you speak. With SI, it also listens for questions on the call and suggests
          answers from your own deck — so founders and presenters stay calm on every investor and client call.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryLink to="/signup">
            Start {TRIAL_DAYS}-day free trial <ArrowRight size={17} />
          </PrimaryLink>
          <SecondaryLink to="/pricing">See pricing — from ${PLANS.standard_monthly.price}/mo</SecondaryLink>
        </div>
        <p className="mt-4 text-[13px] text-slate-500">No card needed · Works with Google Meet, Zoom and Microsoft Teams · Runs in your browser</p>
        <HeroPreview />
      </div>
    </header>
  )
}

/** Illustration of presenting with the SI copilot (animated, not live speech). */
function HeroPreview() {
  const words = useMemo(() => tokenizeScript(PREVIEW_SCRIPT), [])
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % words.length), 380)
    return () => clearInterval(t)
  }, [words.length])
  const config = { ...DEFAULT_SETTINGS.teleprompter, fontSize: 28 }
  return (
    <div className="relative mx-auto mt-16 max-w-5xl text-left">
      <div className="dark rounded-[22px] border border-slate-900/10 bg-slate-900 p-2 shadow-[0_40px_120px_-20px_rgba(15,23,42,0.45)]">
        <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="ml-3 text-[11.5px] text-white/40">Reflex Presenter — Series A pitch</span>
        </div>
        <div className="relative overflow-hidden rounded-xl bg-black">
          <div className="absolute top-0 left-1/2 h-4 w-24 -translate-x-1/2 rounded-b-xl bg-[#1a1a1e]" aria-hidden />
          <div className="flex gap-4 p-4 pt-7 sm:p-6 sm:pt-8">
            <div className="min-w-0 flex-1">
              <div className="mx-auto w-full rounded-2xl border border-white/[0.08] bg-[#0b0b0e]/90 px-3 shadow-xl">
                <Teleprompter words={words} current={i} config={config} pad={4} />
              </div>
              <div className="mt-4 flex aspect-[16/8] flex-col justify-center rounded-lg bg-[#f6f5f1] px-[8%]">
                <p className="text-[10px] font-semibold tracking-[0.2em] text-emerald-700 uppercase sm:text-[11px]">Business model</p>
                <p className="mt-2 text-[clamp(14px,2.6vw,28px)] leading-tight font-bold tracking-tight text-neutral-900">
                  Building the operating infrastructure for global Voice AI
                </p>
                <p className="mt-2 text-[clamp(10px,1.3vw,14px)] text-neutral-500">150,000+ directly verifiable AI calls</p>
              </div>
            </div>
            <div className="hidden w-[270px] shrink-0 flex-col gap-2.5 rounded-xl border border-white/[0.08] bg-[#141418] p-3.5 md:flex">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                <Sparkles size={13} className="text-orange-400" /> SI copilot
                <span className="ml-auto flex items-center gap-1.5 text-[10.5px] font-normal text-white/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Listening
                </span>
              </div>
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-3">
                <p className="flex items-start gap-1.5 text-[11px] leading-snug text-white/50">
                  <Headphones size={11} className="mt-0.5 shrink-0" /> How will you use the money you're raising?
                </p>
                <p className="mt-2 text-[12.5px] leading-relaxed text-white/90">
                  We're raising $1.5M for 18 months of runway, split across three things:
                  <br />• 50% engineering — two senior hires
                  <br />• 30% go-to-market in the US
                  <br />• 20% infrastructure for 1M calls a month
                </p>
              </div>
              <p className="text-[10.5px] leading-snug text-white/35">From your deck and Q&A prep notes · only you can see this</p>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[12.5px] text-slate-500">Preview. While you present, the highlight follows your voice.</p>
    </div>
  )
}

function StatBand() {
  return (
    <section className="border-y border-slate-200 bg-slate-950 text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-[auto_1fr] md:gap-16">
        <div className="text-[64px] leading-none font-semibold tracking-[-0.04em] text-orange-400 sm:text-[88px]">70–77%</div>
        <div>
          <p className="text-[20px] leading-snug font-medium tracking-tight sm:text-[24px]">
            of people feel nervous, anxious or physically uncomfortable when they present.
          </p>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-white/65">
            On an investor or client call, that's exactly when your deck has to carry you — the line you forget, the number you blank on, the question
            you didn't see coming. Reflex is built for that moment.
          </p>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="product" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Product" title="Everything you need to deliver the pitch">
          Import your deck, write or paste exactly what you want to say, and present. Reflex keeps up with you.
        </SectionHeading>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard icon={<Mic size={19} />} title="A teleprompter that listens">
            Your script moves word by word as you speak. Pauses, “um”s, repeats and skipped lines don't throw it off. Say “next” to change slides.
          </FeatureCard>
          <FeatureCard icon={<Eye size={19} />} title="Eye contact, built in">
            The text sits in a slim strip right under your camera, so you look at your audience while you read — not down at your notes.
          </FeatureCard>
          <FeatureCard icon={<MonitorUp size={19} />} title="Share the slides, keep the script">
            On Meet, Zoom or Teams your audience sees only your slides. The teleprompter floats in its own window that you don't share.
          </FeatureCard>
          <FeatureCard icon={<FileText size={19} />} title="Bring any deck">
            PDF and PowerPoint import with OCR for text inside images. Speaker notes become scripts automatically.
          </FeatureCard>
          <FeatureCard icon={<Presentation size={19} />} title="Presenter console">
            On a second display, slides go full-screen for the room while you keep the script, next slide and notes.
          </FeatureCard>
          <FeatureCard icon={<Lock size={19} />} title="Private by design">
            Speech recognition runs on your device. Your voice, slides and scripts are never uploaded.
          </FeatureCard>
        </div>
      </div>
    </section>
  )
}

function CopilotSection() {
  return (
    <section id="copilot" className="scroll-mt-16 border-t border-slate-200 bg-gradient-to-b from-orange-50/70 to-white">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-[12.5px] font-semibold text-orange-700">
            <Sparkles size={13} /> SI · Smart Intelligence
          </p>
          <h2 className="mt-5 text-[34px] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-[42px]">The answer is on screen before the silence gets awkward.</h2>
          <p className="mt-5 text-[16.5px] leading-relaxed text-slate-600">
            Investors and clients always ask the question you didn't put on a slide. SI hears it, and in seconds shows a short, confident answer under
            your script — built only from your deck, your scripts and your Q&A prep notes.
          </p>
          <ol className="mt-8 space-y-5">
            <Step n={1} title="Add your Q&A prep notes">
              Traction, revenue, pricing, team, competitors, your raise and use of funds — the facts you want at your fingertips.
            </Step>
            <Step n={2} title="Listen to the call">
              Click <b>Listen to the call</b> and share your meeting tab's audio. It's transcribed on your computer.
            </Step>
            <Step n={3} title="Glance, answer, move on">
              A suggested answer appears where you're already looking. Or type any question for an instant talking point.
            </Step>
          </ol>
          <p className="mt-8 flex items-start gap-2 text-[13.5px] leading-relaxed text-slate-500">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> SI never invents numbers. If your material doesn't cover a question, it tells
            you — and suggests an honest way to follow up.
          </p>
        </div>
        <div className="dark rounded-3xl border border-slate-900/10 bg-[#0e0e12] p-5 text-white shadow-[0_30px_100px_-20px_rgba(15,23,42,0.5)] sm:p-6">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles size={14} className="text-orange-400" /> SI copilot
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-normal text-red-300">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> Listening to the call
            </span>
          </div>
          <MockQA q="What does your customer acquisition cost look like right now?">
            Our blended CAC is $410, and it's falling.
            <br />• 62% of new accounts come from referrals
            <br />• Payback is 5 months on the Growth plan
            <br />• Paid channels are only 18% of spend
          </MockQA>
          <MockQA q="Why couldn't a big incumbent just build this?">
            They could try, but we're 18 months ahead on the hard part.
            <br />• 150,000+ verified calls train our models
            <br />• Integrations with 40 telephony providers
          </MockQA>
          <MockQA q="What's your churn by cohort?" muted>
            That isn't in my material yet — say you'll share the cohort table after the call, and offer the headline: net revenue retention is 118%.
          </MockQA>
        </div>
      </div>
    </section>
  )
}

function MockQA({ q, children, muted }: { q: string; children: ReactNode; muted?: boolean }) {
  return (
    <div className="mt-3.5 rounded-xl border border-white/[0.08] bg-white/[0.04] p-4">
      <p className="flex items-start gap-1.5 text-[12px] leading-snug text-white/50">
        <Headphones size={12} className="mt-0.5 shrink-0" /> {q}
      </p>
      <p className={`mt-2 text-[14px] leading-relaxed ${muted ? 'text-white/70' : 'text-white/90'}`}>{children}</p>
    </div>
  )
}

function HowItWorks() {
  return (
    <section className="border-t border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="How it works" title="From deck to delivery in three steps" />
        <div className="grid gap-5 md:grid-cols-3">
          <NumberedCard n={1} icon={<FileText size={19} />} title="Import your deck">
            PDF, PPTX or PPT. Every slide is rendered and its text extracted in reading order, with a confidence score.
          </NumberedCard>
          <NumberedCard n={2} icon={<ScanText size={19} />} title="Paste or write your script">
            Each slide gets its own speaking script — paste your own words, start from speaker notes, or let SI draft one.
          </NumberedCard>
          <NumberedCard n={3} icon={<Mic size={19} />} title="Present and answer">
            Speak naturally and the teleprompter follows. When questions come, SI has an answer ready.
          </NumberedCard>
        </div>
      </div>
    </section>
  )
}

function UseCases() {
  return (
    <section id="use-cases" className="scroll-mt-16 border-t border-slate-200 bg-slate-50/70">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Use cases" title="Built for the calls that matter">
          Try it online in your browser — nothing to install.
        </SectionHeading>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <UseCase icon={<Rocket size={19} />} title="Founders pitching investors">
            Deliver the narrative word-perfect, and handle diligence questions on traction, market and the raise.
          </UseCase>
          <UseCase icon={<Briefcase size={19} />} title="Sales & client demos">
            Stay on message through the demo, and answer pricing, security and integration questions on the spot.
          </UseCase>
          <UseCase icon={<Users size={19} />} title="Online interviews">
            Rehearse your stories and the questions you expect, with your own talking points prepared in advance.
          </UseCase>
          <UseCase icon={<Presentation size={19} />} title="Webinars & all-hands">
            Long talks without losing your place, and audience Q&A without the panic.
          </UseCase>
        </div>
      </div>
    </section>
  )
}

function CallsSection() {
  return (
    <section className="border-t border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Google Meet · Zoom · Teams" title="Your audience sees the slides. The script stays with you.">
          Use <b className="font-semibold text-slate-900">Present on a call</b>. Reflex puts the slides and the teleprompter in separate places — then you
          share only the slides.
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-2">
          <CallCard icon={<MonitorUp size={18} />} title="In the browser (Chrome or Edge)">
            <li>Open your deck and click <b>Present on a call</b>, then <b>Start</b>.</li>
            <li>The teleprompter — and SI, if you want it — pops out into a small floating window under your camera.</li>
            <li>
              In Meet: <b>Share screen → A tab</b> → choose the <b>Reflex Presenter</b> tab. Zoom / Teams: share that browser tab.
            </li>
          </CallCard>
          <CallCard icon={<Laptop size={18} />} title="In the Mac app">
            <li>Open your deck and click <b>Present on a call</b>, then <b>Start</b>.</li>
            <li>The slides fill the screen and the teleprompter floats under your camera in its own window.</li>
            <li>
              In the meeting app: <b>Share → Window</b> → <b>Reflex — Slides (share this window)</b>.
            </li>
          </CallCard>
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-[13.5px] leading-relaxed text-slate-500">
          Share the <b className="font-semibold text-slate-700">tab</b> or the <b className="font-semibold text-slate-700">slides window</b>, not “Entire
          screen” — sharing the entire screen sends everything on it, including the teleprompter.
        </p>
      </div>
    </section>
  )
}

function DownloadSection() {
  const [release, setRelease] = useState<Release | null>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}downloads/latest.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setRelease)
      .catch(() => setRelease(null))
  }, [])
  return (
    <section id="download" className="scroll-mt-16 border-t border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col items-start justify-between gap-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm md:flex-row md:items-center md:p-9">
          <div>
            <div className="flex items-center gap-2 text-[18px] font-semibold">
              <Laptop size={20} className="text-orange-600" /> Prefer an app? Get Reflex for Mac
            </div>
            <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">
              {release
                ? `Version ${release.version} · Apple Silicon (M1 and later) · ${Math.max(1, Math.round(release.bytes / 1e6))} MB.`
                : 'Apple Silicon (M1 and later), macOS 11 or newer.'}{' '}
              Works offline after a one-time speech model download. Sign in with the same account.
            </p>
            <p className="mt-2 text-[12.5px] text-slate-500">
              First launch: macOS asks once — open System Settings → Privacy & Security and click <b>Open Anyway</b>.
            </p>
          </div>
          {release ? (
            <a
              href={`${import.meta.env.BASE_URL}downloads/${release.file}`}
              download
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-6 text-[15px] font-medium text-white hover:bg-slate-800"
            >
              <Download size={17} /> Download for Mac
            </a>
          ) : (
            <SecondaryLink to="/app">Use the web app</SecondaryLink>
          )}
        </div>
      </div>
    </section>
  )
}

const FAQ: [string, string][] = [
  [
    'Can the audience see my script?',
    'Not if you share the slides tab or slides window, which is what Present on a call sets up. If you share your entire screen, everything on it is shared — so share the tab or window instead.',
  ],
  [
    'Does it work with Google Meet, Zoom and Microsoft Teams?',
    'Yes. Reflex runs beside any meeting app. In the browser, share the Reflex tab; in the Mac app, share the slides window.',
  ],
  [
    'Is my voice or my deck uploaded?',
    'No. Speech recognition runs on your device and your slides and scripts are stored on your device. Only when SI answers a question are that question and the relevant text of your deck sent to our AI provider.',
  ],
  [
    'What do I need?',
    'Chrome or Edge on a computer (or the Mac app) and a microphone. The first time you present, a speech model (~120 MB) is downloaded once and cached.',
  ],
  [
    'What happens after the free trial?',
    `Choose Standard ($${PLANS.standard_monthly.price}/month or $${PLANS.standard_yearly.price}/year, unlimited usage) or SI ($${PLANS.si_monthly.price}/month or $${PLANS.si_yearly.price}/year). Plans are prepaid and never renew automatically.`,
  ],
]

function Faq() {
  return (
    <section className="border-t border-slate-200 bg-slate-50/70">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15.5px] font-medium">
                {q}
                <span className="text-[18px] text-slate-400 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="bg-slate-950 text-white">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-[34px] leading-tight font-semibold tracking-[-0.03em] sm:text-[44px]">Your next pitch can feel easy.</h2>
        <p className="mx-auto mt-4 max-w-xl text-[16.5px] leading-relaxed text-white/65">
          Start your {TRIAL_DAYS}-day free trial in the browser. Bring a deck — you'll be presenting with it in five minutes.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryLink to="/signup">
            Start free trial <ArrowRight size={17} />
          </PrimaryLink>
          <Link to="/pricing" className="inline-flex h-12 items-center rounded-xl border border-white/20 px-6 text-[15px] font-medium text-white hover:bg-white/10">
            Compare plans
          </Link>
        </div>
      </div>
    </section>
  )
}

function SectionHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center">
      <p className="text-[12.5px] font-semibold tracking-[0.16em] text-orange-600 uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-[30px] leading-tight font-semibold tracking-[-0.03em] sm:text-[40px]">{title}</h2>
      {children && <p className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-slate-600">{children}</p>}
    </div>
  )
}

function FeatureCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-16px_rgba(15,23,42,0.18)]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">{icon}</span>
      <h3 className="mt-4 text-[16.5px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">{children}</p>
    </div>
  )
}

function NumberedCard({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">{icon}</span>
        <span className="text-[13px] font-semibold text-slate-400">0{n}</span>
      </div>
      <h3 className="mt-4 text-[16.5px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">{children}</p>
    </div>
  )
}

function UseCase({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-600 text-white">{icon}</span>
      <h3 className="mt-4 text-[16px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{children}</p>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-600 text-[13px] font-semibold text-white">{n}</span>
      <div>
        <h3 className="text-[15.5px] font-semibold">{title}</h3>
        <p className="mt-1 text-[14.5px] leading-relaxed text-slate-600 [&_b]:font-semibold [&_b]:text-slate-900">{children}</p>
      </div>
    </li>
  )
}

function CallCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2.5 text-[16px] font-semibold">
        <span className="text-orange-600">{icon}</span> {title}
      </div>
      <ol className="mt-4 flex list-decimal flex-col gap-2.5 pl-5 text-[14.5px] leading-relaxed text-slate-600 marker:text-slate-400 [&_b]:font-semibold [&_b]:text-slate-900">
        {children}
      </ol>
    </div>
  )
}
