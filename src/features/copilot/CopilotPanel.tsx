import { ChevronLeft, ChevronRight, Copy, Check, Headphones, Loader2, MessageSquare, RefreshCw, RotateCcw, Send, Settings2, Sparkles, Star, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { SITE_URL } from '../../config'
import { platform } from '../../platform'
import type { ScriptWord } from '../../types'
import { entitlements, useAccount } from '../account/account'
import { useSettings } from '../settings/settingsStore'
import { AnswerText } from './AnswerText'
import type { Copilot, QA } from './useCopilot'

/** Opens a site page without leaving the presentation. */
function openSite(path: string) {
  void platform.openExternal(platform.kind === 'web' ? new URL(path, location.origin).href : `${SITE_URL}${path}`).catch(() => null)
}

const mod = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'

export interface ScriptView {
  /** Presentation name, e.g. "Present — Series A Pitch". */
  title: string
  slideLabel: string
  words: ScriptWord[]
  /** Highlighted word of the teleprompter (the voice-tracked position). */
  wordIndex: number
  spoken: boolean
  onGenerate?: () => void
  generating?: boolean
}

/**
 * The SI (Super Intelligence) assistant, in three parts:
 *   A. the active slide's script, with the sentence being spoken highlighted;
 *   B. Question | Answer — ask (or pick a suggested question) and read the answer,
 *      whose highlight follows your voice;
 *   C. listening status, Answer now, history, Clear and Hide.
 * `side` docks beside the slide (and in the presenter console); `strip` is the
 * compact version in the floating window used on calls.
 */
export function CopilotPanel({ copilot, script, variant, onClose }: { copilot: Copilot; script: ScriptView; variant: 'side' | 'strip'; onClose?: () => void }) {
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)
  const si = useSettings((s) => s.settings.si)
  const transitionMs = useSettings((s) => s.settings.teleprompter.transitionMs)
  const [tab, setTab] = useState<'question' | 'answer'>('question')
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const compact = variant === 'strip'
  const listening = copilot.listen === 'listening'
  const canAsk = !!session && ent.canAsk
  const panelStyle: CSSProperties = { background: `rgb(22 23 28 / ${Math.round(si.opacity * 100)}%)` }

  // A new question (typed, suggested or heard on the call) shows its answer.
  const newest = copilot.items[0]?.id
  const seen = useRef(newest)
  useEffect(() => {
    if (newest !== undefined && newest !== seen.current) setTab('answer')
    seen.current = newest
  }, [newest])

  const submit = (text = draft) => {
    if (!text.trim()) return
    copilot.ask(text)
    setDraft('')
  }
  const answerNow = () => {
    if (!copilot.answerNow()) {
      setTab('question')
      requestAnimationFrame(() => input.current?.focus())
    }
  }

  return (
    <div
      className={`selectable flex min-h-0 flex-col overflow-hidden text-white ${compact ? 'h-full' : 'h-full rounded-2xl border border-white/10 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl'}`}
      style={compact ? undefined : panelStyle}
    >
      {/* A — script for the slide on screen */}
      <ScriptSection script={script} compact={compact} textSize={si.textSize} canGenerate={canAsk} />

      {/* B — Question | Answer */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-white/[0.08]">
        <div className={`flex shrink-0 items-center gap-2 ${compact ? 'px-3 pt-2' : 'px-4 pt-3'}`}>
          <div className="inline-flex rounded-lg bg-white/[0.06] p-0.5 text-[12.5px] font-medium">
            {(['question', 'answer'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex h-7 items-center gap-1.5 rounded-md px-3 transition ${tab === t ? 'bg-white/[0.14] text-white shadow-sm' : 'text-white/55 hover:text-white'}`}
              >
                {t === 'question' ? 'Question' : 'Answer'}
                {t === 'answer' && copilot.items.length > 0 && <span className="rounded-full bg-white/10 px-1.5 text-[10.5px] text-white/70 tabular">{copilot.items.length}</span>}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          {session && profile && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-accent" title="SI — Super Intelligence">
              <Sparkles size={10} className="mr-0.5 inline -translate-y-px" />
              {ent.si ? 'SI' : `${ent.freeAnswersLeft} free`}
            </span>
          )}
          {!compact && (
            <button type="button" title="SI settings" onClick={() => openSite('/settings#si')} className="rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white">
              <Settings2 size={14} />
            </button>
          )}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
          {!canAsk ? (
            <div className="rounded-xl border border-accent/25 bg-accent-soft p-3">
              <p className="text-[12.5px] leading-relaxed text-white/85">
                {!session ? 'Sign in to ask SI — Super Intelligence answers questions from your own deck.' : 'Answers are part of the SI plan — $9/month or $69/year.'}
              </p>
              <Button size="sm" variant="primary" className="mt-2" onClick={() => openSite(session ? '/account?plan=si_monthly' : '/login')}>
                {session ? 'Upgrade to SI' : 'Sign in'}
              </Button>
            </div>
          ) : tab === 'question' ? (
            <div className="flex flex-col gap-2.5">
              <form
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/25 pr-1 pl-3 focus-within:border-accent/60"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
              >
                <input
                  ref={input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask about this slide or your pitch…"
                  className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/40"
                />
                <button
                  type="submit"
                  title="Ask (Enter)"
                  disabled={!draft.trim()}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg transition hover:brightness-110 disabled:bg-white/10 disabled:text-white/30"
                >
                  <Send size={13} />
                </button>
              </form>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-white/45 uppercase">
                  Suggested
                  {copilot.suggestions.loading ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <button type="button" title="New suggestions" onClick={copilot.refreshSuggestions} className="rounded p-0.5 hover:bg-white/10 hover:text-white">
                      <RefreshCw size={11} />
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {copilot.suggestions.questions.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => submit(q)}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-left text-[12.5px] leading-snug text-white/85 transition hover:border-accent/40 hover:bg-white/[0.08] hover:text-white"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : copilot.current ? (
            <AnswerView q={copilot.current} copilot={copilot} textSize={si.textSize} highlight={si.highlightStyle} transitionMs={transitionMs} compact={compact} />
          ) : (
            <p className="py-2 text-[12.5px] leading-relaxed text-white/50">
              No answers yet. Ask a question{platform.kind === 'web' ? ', or listen to the call and press Answer when someone asks one' : ''}.
            </p>
          )}
        </div>
      </div>

      {/* C — session controls */}
      {copilot.notice && (
        <div className="flex shrink-0 items-start gap-2 border-t border-white/[0.08] bg-danger/10 px-4 py-2 text-[12px] leading-snug text-white/85">
          <span className="flex-1">{copilot.notice}</span>
          <button type="button" title="Dismiss" onClick={copilot.dismissNotice} className="text-white/50 hover:text-white">
            <X size={13} />
          </button>
        </div>
      )}
      {listening && (copilot.heard.partial || copilot.heard.final.length > 0) && (
        <div className="shrink-0 truncate border-t border-white/[0.08] px-4 py-1.5 text-[12px] text-white/55" title="What the call is saying">
          “{[copilot.heard.final.at(-1), copilot.heard.partial].filter(Boolean).join(' ')}”
        </div>
      )}
      <div className={`flex shrink-0 items-center gap-1 border-t border-white/[0.08] ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
        {platform.kind === 'web' && (
          <button
            type="button"
            disabled={!canAsk || copilot.listen === 'starting'}
            onClick={() => void (listening ? copilot.stopListening() : copilot.startListening())}
            title={listening ? 'Stop listening to the call' : 'Listen to the call — share the meeting tab with “Also share tab audio”'}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition disabled:opacity-35 ${
              listening ? 'bg-success/15 text-success' : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {copilot.listen === 'starting' ? <Loader2 size={13} className="animate-spin" /> : <Headphones size={13} />}
            {listening ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" /> Listening
              </>
            ) : (
              !compact && 'Listen'
            )}
          </button>
        )}
        <button
          type="button"
          disabled={!canAsk}
          onClick={answerNow}
          title={`Answer what was just asked (${mod}↵)`}
          className="flex h-7 items-center gap-1.5 rounded-lg bg-white/[0.07] px-2.5 text-[12px] font-medium text-white/90 transition hover:bg-white/[0.14] disabled:opacity-35"
        >
          Answer {!compact && <kbd className="font-sans text-[10.5px] text-white/45">{mod}↵</kbd>}
        </button>
        <div className="flex-1" />
        {copilot.items.length > 1 && (
          <div className="flex items-center gap-0.5 text-[11px] text-white/50 tabular">
            <NavButton title={`Older answer (${mod}←)`} disabled={copilot.index >= copilot.items.length - 1} onClick={() => (setTab('answer'), copilot.older())}>
              <ChevronLeft size={13} />
            </NavButton>
            {copilot.items.length - copilot.index}/{copilot.items.length}
            <NavButton title={`Newer answer (${mod}→)`} disabled={copilot.index === 0} onClick={() => (setTab('answer'), copilot.newer())}>
              <ChevronRight size={13} />
            </NavButton>
          </div>
        )}
        {(copilot.items.length > 0 || copilot.heard.final.length > 0) && (
          <button type="button" onClick={copilot.clear} className="rounded-lg px-2 py-1 text-[12px] text-white/55 hover:bg-white/10 hover:text-white">
            Clear
          </button>
        )}
        {onClose && (
          <button type="button" title="Hide the assistant (Q)" onClick={onClose} className="rounded-lg px-2 py-1 text-[12px] font-medium text-white/70 hover:bg-white/10 hover:text-white">
            Hide
          </button>
        )}
      </div>
    </div>
  )
}

/** Splits a slide's words into sentences, keeping word indexes. */
function sentencesOf(words: ScriptWord[]): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = []
  let from = 0
  words.forEach((w, i) => {
    if (/[.!?…]["')\]]*$/.test(w.text) || i === words.length - 1) {
      out.push({ from, to: i + 1, text: words.slice(from, i + 1).map((x) => x.text).join(' ') })
      from = i + 1
    }
  })
  return out
}

function ScriptSection({ script, compact, textSize, canGenerate }: { script: ScriptView; compact: boolean; textSize: number; canGenerate: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLSpanElement>(null)
  const sentences = useMemo(() => sentencesOf(script.words), [script.words])
  const currentSentence = script.spoken ? sentences.findIndex((s) => script.wordIndex >= s.from && script.wordIndex < s.to) : -1

  // Keep the sentence being spoken in view without moving anything else.
  useLayoutEffect(() => {
    const el = currentRef.current
    const c = box.current
    if (!el || !c) return
    const top = el.offsetTop - c.offsetTop
    if (top < c.scrollTop || top + el.offsetHeight > c.scrollTop + c.clientHeight) c.scrollTo({ top: Math.max(0, top - c.clientHeight / 3), behavior: 'smooth' })
  }, [currentSentence])

  return (
    <div className={`shrink-0 ${compact ? 'px-3 pt-2 pb-2' : 'px-4 pt-3.5 pb-3'}`}>
      <div className="flex items-center gap-2">
        <span className="truncate text-[11px] font-semibold tracking-[0.08em] text-white/55 uppercase" title={script.title}>
          {script.title}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-white/40 tabular">{script.slideLabel}</span>
      </div>
      {script.words.length === 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-2.5">
          <span className="text-[12.5px] text-white/55">No speaker notes for this slide yet.</span>
          {script.onGenerate && canGenerate && (
            <button
              type="button"
              disabled={script.generating}
              onClick={script.onGenerate}
              className="ml-auto flex h-7 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[12px] font-medium text-accent-fg hover:brightness-110 disabled:opacity-60"
            >
              {script.generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Generate with AI
            </button>
          )}
        </div>
      ) : (
        <div ref={box} className="relative mt-2 overflow-y-auto pr-1" style={{ maxHeight: compact ? '4.6em' : '30vh', fontSize: textSize + 1, lineHeight: 1.6 }}>
          {sentences.map((s, i) => (
            <span
              key={s.from}
              ref={i === currentSentence ? currentRef : undefined}
              className={`rounded-md transition-colors duration-200 ${
                i === currentSentence ? 'bg-accent-soft text-white' : currentSentence >= 0 && i < currentSentence ? 'text-white/40' : 'text-white/80'
              }`}
              style={i === currentSentence ? { boxShadow: '0 0 0 2px var(--app-accent-soft)' } : undefined}
            >
              {s.text}{' '}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function AnswerView({
  q,
  copilot,
  textSize,
  highlight,
  transitionMs,
  compact,
}: {
  q: QA
  copilot: Copilot
  textSize: number
  highlight: ReturnType<typeof useSettings.getState>['settings']['si']['highlightStyle']
  transitionMs: number
  compact: boolean
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="group/c relative flex items-start gap-2 pr-6" style={{ fontSize: Math.max(11.5, textSize - 0.5), lineHeight: 1.5 }}>
        <MessageSquare size={13} className="mt-[0.3em] shrink-0 text-white/45" />
        <p className="text-white/80">
          <b className="font-semibold text-white">Question:</b> {q.question}
        </p>
        <CopyButton text={q.question} />
      </div>
      <div className="group/c relative rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5 pr-8">
        <div className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-white">
          <Star size={12} className="text-amber-400" fill="currentColor" /> Answer
          {q.status === 'answering' && <Loader2 size={11} className="animate-spin text-white/40" />}
        </div>
        {q.status === 'error' ? (
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[12.5px] leading-snug text-danger">{q.error}</p>
            {q.code === 'SI_REQUIRED' ? (
              <Button size="sm" variant="primary" onClick={() => openSite('/account?plan=si_monthly')}>
                Upgrade
              </Button>
            ) : q.code === 'AI_NOT_CONFIGURED' ? (
              <Button size="sm" variant="primary" onClick={() => openSite('/settings#si')}>
                Add API key
              </Button>
            ) : (
              <button type="button" title="Try again" onClick={() => copilot.answerItem(q)} className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white">
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        ) : q.status === 'answering' ? (
          q.answer ? (
            <p className="whitespace-pre-line text-white" style={{ fontSize: textSize, lineHeight: 1.6 }}>
              {q.answer}
              <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent animate-pulse-dot" />
            </p>
          ) : (
            <p className="text-[12.5px] text-white/50">Writing the answer…</p>
          )
        ) : q.answer && copilot.layout && copilot.current?.id === q.id ? (
          <>
            <AnswerText layout={copilot.layout} current={copilot.readIndex} style={highlight} fontSize={textSize} transitionMs={transitionMs} />
            <CopyButton text={q.answer} />
          </>
        ) : (
          <Button size="sm" onClick={() => copilot.answerItem(q)}>
            Suggest an answer
          </Button>
        )}
      </div>
      {q.status === 'done' && q.answer && !compact && (
        <p className="text-[11px] text-white/35">
          {new Date(q.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · read it aloud and the highlight follows your voice
        </p>
      )}
    </div>
  )
}

function NavButton({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-25">
      {children}
    </button>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copy"
      aria-label="Copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="absolute top-1.5 right-1.5 rounded-md p-1 text-white/35 opacity-0 transition-opacity group-hover/c:opacity-100 hover:bg-white/10 hover:text-white"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  )
}
