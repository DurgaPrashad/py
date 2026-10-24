import {
  ArrowRight,
  AudioLines,
  MessageSquare,
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
import { INSTALL_COMMAND, PLANS, PRESENTATION_LIMIT } from '../config'
import { AnswerText, answerLayout } from '../features/copilot/AnswerText'
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
          <SectionHeading eyebrow="Pricing" title="Less than a coffee a month. Never go blank again.">
            Standard keeps your own script in front of you, following your voice. SI also hands you the answer when they ask — on your own AI key, with
            no daily caps.
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
        className="pointer-events-none absolute inset-0 opacity-[0.8] [background-image:linear-gradient(to_right,rgb(203_213_225)_1px,transparent_1px),linear-gradient(to_bottom,rgb(203_213_225)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_35%,transparent_75%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-orange-200/40 blur-3xl" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 pt-16 pb-20 text-center sm:px-6 sm:pt-24">
        <a
          href="#copilot"
          className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 py-1 pr-3 pl-1 text-[13px] text-slate-700 shadow-sm"
        >
          <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[11.5px] font-semibold text-white">New</span>
          SI — Super Intelligence answers the questions you didn't rehearse <ArrowRight size={13} />
        </a>
        <h1 className="mx-auto mt-7 max-w-4xl text-[40px] leading-[1.04] font-semibold tracking-[-0.04em] text-slate-900 sm:text-[64px]">
          Never go blank in a pitch <span className="text-orange-600">or a meeting.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-slate-600 sm:text-[18px]">
          Present is the AI agent at your side for the moments you forget what to say. Your script stays right in front of you and moves as you speak —
          and when someone asks a question, SI hears it and tells you what to answer, from your own deck and sources.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryLink to="/signup">
            Get started <ArrowRight size={17} />
          </PrimaryLink>
          <DesktopCta />
        </div>
        <p className="mt-4 text-[13px] text-slate-500">
          Works with Google Meet, Zoom and Microsoft Teams ·{' '}
          <Link to="/pricing" className="font-medium text-slate-700 underline-offset-2 hover:underline">
            Pricing from ${PLANS.standard_monthly.price}/mo
          </Link>
        </p>
        <HeroPreview />
      </div>
    </header>
  )
}

/** The SI demo's loop, in 100 ms ticks: listen, hear the question, think, stream, read along. */
const DEMO = { hear: 14, think: 38, stream: 50, ready: 82, end: 160 }
const PREVIEW_QUESTION = "How will you use the money you're raising?"
const PREVIEW_ANSWER_TEXT = "We're raising $1.5M for 18 months of runway.\n• 50% engineering — two senior hires\n• 30% go-to-market in the US\n• 20% infrastructure"
const PREVIEW_ANSWER = answerLayout(PREVIEW_ANSWER_TEXT)

/**
 * Illustration of presenting (animated, not live speech): the two floating
 * panels of the presenter view — the slim reading strip and, right under it,
 * SI listening to the call and answering.
 */
function HeroPreview() {
  const words = useMemo(() => tokenizeScript(PREVIEW_SCRIPT), [])
  const questionWords = useMemo(() => PREVIEW_QUESTION.split(' '), [])
  const [i, setI] = useState(0)
  const [t, setT] = useState(0)
  useEffect(() => {
    const read = setInterval(() => setI((v) => (v + 1) % words.length), 380)
    const demo = setInterval(() => setT((v) => (v + 1) % DEMO.end), 100)
    return () => {
      clearInterval(read)
      clearInterval(demo)
    }
  }, [words.length])

  const hearing = t >= DEMO.hear && t < DEMO.think
  const thinking = t >= DEMO.think && t < DEMO.stream
  const streaming = t >= DEMO.stream && t < DEMO.ready
  const ready = t >= DEMO.ready
  const heard = questionWords.slice(0, Math.ceil(((t - DEMO.hear + 1) / (DEMO.think - DEMO.hear - 4)) * questionWords.length)).join(' ')
  const streamed = PREVIEW_ANSWER_TEXT.slice(0, Math.round(((t - DEMO.stream + 1) / (DEMO.ready - DEMO.stream)) * PREVIEW_ANSWER_TEXT.length))
  const readIndex = ready ? Math.min(Math.floor((t - DEMO.ready - 6) / 2.4), PREVIEW_ANSWER.words.length - 1) : -1
  const state = thinking || streaming
    ? { label: 'Processing', cls: 'text-orange-300', icon: <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-orange-300/30 border-t-orange-300" /> }
    : ready
      ? { label: 'Answer ready', cls: 'text-orange-300', icon: <Check size={12} /> }
      : hearing
        ? { label: 'Hearing a question', cls: 'text-teal-300', icon: <Mic size={12} /> }
        : { label: 'Listening', cls: 'text-teal-300', icon: <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" /> }
  const config = { ...DEFAULT_SETTINGS.teleprompter, fontSize: 26 }

  return (
    <div className="relative mx-auto mt-16 max-w-5xl text-left">
      <div className="dark rounded-[22px] border border-slate-900/10 bg-slate-900 p-2 shadow-[0_40px_120px_-20px_rgba(15,23,42,0.45)]">
        <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          <span className="ml-3 text-[11.5px] text-white/40">Present — Series A pitch</span>
        </div>
        <div className="relative overflow-hidden rounded-xl bg-[#0d0e12] [background-image:radial-gradient(ellipse_at_top,rgba(255,255,255,0.05),transparent_60%)]">
          {/* The slide */}
          <div className="px-[6%] pt-[150px] pb-[5%] sm:pt-[118px]">
            <div className="flex aspect-[16/8.2] flex-col justify-end rounded-lg bg-[#f6f5f1] px-[8%] pb-[6%] shadow-2xl shadow-black/40">
              <p className="text-[10px] font-semibold tracking-[0.2em] text-emerald-700 uppercase sm:text-[11px]">Business model</p>
              <p className="mt-2 text-[clamp(14px,2.6vw,28px)] leading-tight font-bold tracking-tight text-neutral-900">
                Building the operating infrastructure for global Voice AI
              </p>
              <p className="mt-2 text-[clamp(10px,1.3vw,14px)] text-neutral-500">150,000+ directly verifiable AI calls</p>
            </div>
          </div>

          {/* Two floating panels, stacked near the top */}
          <div className="absolute inset-x-0 top-3 flex flex-col items-center gap-2 px-3">
            {/* 1 · Reading strip */}
            <div className="relative w-full max-w-[640px] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0b0e]/[0.92] px-4 shadow-[0_14px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl">
              <Teleprompter words={words} current={i} config={config} pad={4} />
              <div className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-orange-500/60 to-transparent" />
            </div>

            {/* 2 · SI — listening and answering */}
            <div className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-white/10 bg-[#18191d]/[0.92] text-white shadow-[0_18px_50px_-10px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              <div className="flex h-11 items-center gap-1.5 pr-2 pl-1.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-400/15 text-teal-300">
                  <Headphones size={15} />
                </span>
                <span className="flex items-center gap-1 text-[12.5px] font-semibold text-orange-300">
                  <Sparkles size={12} /> SI
                </span>
                <span className={`ml-1 flex items-center gap-1.5 text-[12px] ${state.cls}`}>
                  {state.icon}
                  <span className="hidden sm:inline">{state.label}</span>
                </span>
                <span className="flex-1" />
                <span className="rounded-lg px-2 py-1 text-[12px] font-medium text-white/75">Ask</span>
                <span className="rounded-lg bg-white/[0.07] px-2 py-1 text-[12px] font-medium text-white/85">
                  Answer <kbd className="ml-0.5 font-sans text-[10px] text-white/40">⌘↵</kbd>
                </span>
              </div>
              <div className="min-h-[132px] border-t border-white/[0.07] px-4 py-3">
                {t < DEMO.hear ? (
                  <p className="flex items-center gap-2 text-[12.5px] text-white/45">
                    <AudioLines size={14} className="text-teal-400/80" /> Listening to the call — answers appear here when someone asks a question.
                  </p>
                ) : hearing ? (
                  <p className="text-[13px] text-teal-200/90 italic">
                    {heard}
                    <span className="ml-0.5 inline-block h-3 w-px translate-y-0.5 animate-pulse bg-teal-300" />
                  </p>
                ) : (
                  <>
                    <p className="flex items-start gap-2 text-[12.5px] leading-snug text-white/60">
                      <MessageSquare size={13} className="mt-0.5 shrink-0 text-white/40" />
                      {PREVIEW_QUESTION}
                    </p>
                    <div className="mt-2">
                      {thinking ? (
                        <p className="text-[13px] text-white/40">Thinking…</p>
                      ) : streaming ? (
                        <p className="text-[13px] leading-[1.6] whitespace-pre-line text-white/90">
                          {streamed}
                          <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-orange-300" />
                        </p>
                      ) : (
                        <AnswerText layout={PREVIEW_ANSWER} current={readIndex} style="pill" fontSize={13} transitionMs={120} emphasize />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[12.5px] text-slate-500">
        Preview. Two panels and nothing else: your script follows your voice, and SI answers the question just asked — figures stand out.
      </p>
    </div>
  )
}

/** The landing page's premium desktop download button (jumps to the download section). */
function DesktopCta() {
  return (
    <a
      href="#download"
      className="group inline-flex h-12 items-center gap-3 rounded-xl bg-gradient-to-b from-slate-800 to-slate-950 pr-5 pl-4 text-left text-white shadow-[0_14px_34px_-12px_rgba(15,23,42,0.75),inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-slate-900/10 transition hover:-translate-y-px hover:from-slate-700"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
        <Download size={16} />
      </span>
      <span className="leading-tight">
        <span className="block text-[14.5px] font-semibold">Download for Desktop</span>
        <span className="block text-[11.5px] text-white/60">macOS · Apple Silicon</span>
      </span>
    </a>
  )
}

function StatBand() {
  return (
    <section className="border-y border-slate-200 bg-slate-950 text-white">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-2 md:gap-16">
        <Stat value="#1" title="Speaking in front of a group topped the list of fears in a survey of 2,543 American adults." source="R. H. Bruskin Associates survey, 1973">
          On an investor or client call, that's exactly when your deck has to carry you — the line you forget, the number you blank on, the question you
          didn't see coming.
        </Stat>
        <Stat
          value="60%"
          title="of founders who started a business in 2025 used AI to help launch it — up from 21% in 2023."
          source="Gusto, New Business Formation Report, 2026"
          href="https://gusto.com/resources/gusto-insights/new-business-formation-2026"
        >
          AI already helps write the deck and the speaker notes. Present brings it into the room: your script follows your voice, and SI answers with you
          when the questions start.
        </Stat>
      </div>
    </section>
  )
}

function Stat({ value, title, source, href, children }: { value: string; title: string; source: string; href?: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[60px] leading-none font-semibold tracking-[-0.04em] text-orange-400 sm:text-[76px]">{value}</div>
      <p className="mt-4 text-[19px] leading-snug font-medium tracking-tight sm:text-[21px]">{title}</p>
      <p className="mt-3 text-[15px] leading-relaxed text-white/65">{children}</p>
      <p className="mt-3 text-[12px] text-white/40">
        Source:{' '}
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white/70">
            {source}
          </a>
        ) : (
          source
        )}
      </p>
    </div>
  )
}

function Features() {
  return (
    <section id="product" className="relative scroll-mt-16 overflow-hidden bg-[#07070b] text-white">
      {/* Visible grid and colour glows behind the glass cards. */}
      <div
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.075)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.075)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_100%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute top-24 -left-24 h-[380px] w-[380px] rounded-full bg-orange-500/30 blur-[110px]" aria-hidden />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-[420px] w-[420px] rounded-full bg-indigo-500/25 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[260px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/10 blur-[100px]" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHeading eyebrow="Product" title="Everything you need to deliver the pitch" dark>
          Import your deck, write or paste exactly what you want to say, and present. Present keeps up with you.
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
            <Sparkles size={13} /> SI · Super Intelligence
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
              Click the <b>headphones</b> and share your meeting tab's audio. What they say appears as live text, transcribed on your computer.
            </Step>
            <Step n={3} title="Read the answer — it follows you">
              SI waits until the question is finished, then shows a short answer right under your script. As you read it out, the highlight moves with
              your voice. Press <b>⌘↵</b> to answer anything on demand, or <b>Ask</b> to type.
            </Step>
          </ol>
          <p className="mt-8 flex items-start gap-2 text-[13.5px] leading-relaxed text-slate-500">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" /> SI never invents numbers. If your material doesn't cover a question, it tells
            you — and suggests an honest way to follow up.
          </p>
        </div>
        <div className="dark rounded-3xl border border-slate-900/10 bg-[#0e0e12] p-5 text-white shadow-[0_30px_100px_-20px_rgba(15,23,42,0.5)] sm:p-6">
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <Sparkles size={14} className="text-orange-400" /> SI
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-teal-400/10 px-2.5 py-1 text-[11px] font-normal text-teal-300">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" /> Listening to the call
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
          Use <b className="font-semibold text-slate-900">Present on a call</b>. Present puts the slides and the teleprompter in separate places — then you
          share only the slides.
        </SectionHeading>
        <div className="grid gap-5 md:grid-cols-2">
          <CallCard icon={<MonitorUp size={18} />} title="In the browser (Chrome or Edge)">
            <li>Open your deck and click <b>Present on a call</b>, then <b>Start</b>.</li>
            <li>The teleprompter — and SI, if you want it — pops out into a small floating window under your camera.</li>
            <li>
              In Meet: <b>Share screen → A tab</b> → choose the <b>Present</b> tab. Zoom / Teams: share that browser tab.
            </li>
          </CallCard>
          <CallCard icon={<Laptop size={18} />} title="In the Mac app">
            <li>Open your deck and click <b>Present on a call</b>, then <b>Start</b>.</li>
            <li>The slides fill the screen and the teleprompter floats under your camera in its own window.</li>
            <li>
              In the meeting app: <b>Share → Window</b> → <b>Present — Slides (share this window)</b>.
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
              <Laptop size={20} className="text-orange-600" /> Prefer an app? Get Present for Desktop
            </div>
            <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">
              {release
                ? `Version ${release.version} · Apple Silicon (M1 and later) · ${Math.max(1, Math.round(release.bytes / 1e6))} MB.`
                : 'Apple Silicon (M1 and later), macOS 11 or newer.'}{' '}
              Works offline after a one-time speech model download. Sign in with the same account.
            </p>
            <p className="mt-3 text-[12.5px] text-slate-500">Easiest: paste this in Terminal — it installs and opens the app with no macOS warning.</p>
            <code className="mt-1.5 block rounded-lg bg-slate-900 px-3 py-2 font-mono text-[12px] [overflow-wrap:anywhere] text-slate-100 select-all">
              {INSTALL_COMMAND}
            </code>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row">
            {release ? (
              <a
                href={`${import.meta.env.BASE_URL}downloads/${release.file}`}
                download
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-slate-800 to-slate-950 px-6 text-[15px] font-medium text-white shadow-[0_10px_30px_-10px_rgba(15,23,42,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] hover:from-slate-700"
              >
                <Download size={17} /> Download for Desktop
              </a>
            ) : (
              <SecondaryLink to="/app">Use the web app</SecondaryLink>
            )}
            <SecondaryLink to="/download">Installation guide</SecondaryLink>
          </div>
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
    'Yes. Present runs beside any meeting app. In the browser, share the Present tab; in the Mac app, share the slides window.',
  ],
  [
    'Is my voice or my deck uploaded?',
    'No. Speech recognition runs on your device and your slides and scripts are stored on your device. Only when SI answers a question are that question and the relevant text of your deck sent — straight from your device — to the AI provider you connected with your own key.',
  ],
  [
    'What do I need?',
    'Chrome or Edge on a computer (or the Mac app) and a microphone. The first time you present, a speech model (~120 MB) is downloaded once and cached.',
  ],
  [
    'How do I start?',
    `Create an account and set up your first presentations. To present, choose Standard ($${PLANS.standard_monthly.price}/month for ${PRESENTATION_LIMIT.standard} presentations, or $${PLANS.standard_yearly.price}/year unlimited) or SI ($${PLANS.si_monthly.price}/month for ${PRESENTATION_LIMIT.si}, or $${PLANS.si_yearly.price}/year unlimited). SI runs on your own AI key. Plans are prepaid and never renew automatically.`,
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
          Create your account, pick a plan, and bring a deck — you'll be presenting with it in five minutes.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <PrimaryLink to="/signup">
            Get started <ArrowRight size={17} />
          </PrimaryLink>
          <Link to="/pricing" className="inline-flex h-12 items-center rounded-xl border border-white/20 px-6 text-[15px] font-medium text-white hover:bg-white/10">
            Compare plans
          </Link>
        </div>
      </div>
    </section>
  )
}

function SectionHeading({ eyebrow, title, dark, children }: { eyebrow: string; title: string; dark?: boolean; children?: ReactNode }) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center">
      <p className={`text-[12.5px] font-semibold tracking-[0.16em] uppercase ${dark ? 'text-orange-400' : 'text-orange-600'}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-[30px] leading-tight font-semibold tracking-[-0.03em] sm:text-[40px] ${dark ? 'text-white' : ''}`}>{title}</h2>
      {children && <p className={`mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed ${dark ? 'text-white/70' : 'text-slate-600'}`}>{children}</p>}
    </div>
  )
}

/** Glass card: translucent dark panel over the section's grid and glows. */
function FeatureCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="group rounded-2xl border border-white/[0.12] bg-white/[0.06] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_20px_50px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] text-orange-300">{icon}</span>
      <h3 className="mt-4 text-[16.5px] font-semibold tracking-tight text-white">{title}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-white/70">{children}</p>
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
