import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, GripVertical, Headphones, Loader2, MessageSquare, Mic, PlugZap, RefreshCw, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { PLANS, SITE_URL } from '../../config'
import { platform } from '../../platform'
import type { HighlightStyle, OwnKeyProvider } from '../../types'
import { entitlements, useAccount } from '../account/account'
import { useSettings } from '../settings/settingsStore'
import { AnswerText } from './AnswerText'
import { ownKeyReady, PROVIDERS } from './providers'
import type { Copilot, QA } from './useCopilot'

/** Opens a site page without leaving the presentation. */
function openSite(path: string) {
  void platform.openExternal(platform.kind === 'web' ? new URL(path, location.origin).href : `${SITE_URL}${path}`).catch(() => null)
}

const mod = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'

/** Height of the header row: the presenter view reserves it so the slide never jumps. */
export const SI_HEADER_H = 44

/**
 * SI (Super Intelligence) — the live listening and answer panel. One card:
 * a slim header (listening, SI, Listening / Processing / Answer ready, Ask,
 * Answer, history, collapse, close) and a body with the question and its
 * answer, streamed, figures emphasised, highlight following your voice.
 * `onDrag` makes the grip move the panel.
 */
export function SiPanel({
  copilot,
  compact = false,
  onClose,
  onDrag,
  onResetPosition,
}: {
  copilot: Copilot
  compact?: boolean
  onClose?: () => void
  onDrag?: (dx: number, dy: number) => void
  onResetPosition?: () => void
}) {
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)
  const si = useSettings((s) => s.settings.si)
  const transitionMs = useSettings((s) => s.settings.teleprompter.transitionMs)
  const [asking, setAsking] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [draft, setDraft] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const canAsk = !!session && ent.canAsk
  // SI runs on the presenter's own AI: until a key is connected, the panel offers to connect one.
  const aiReady = ownKeyReady(si)
  const [connecting, setConnecting] = useState(false)
  const listening = copilot.listen === 'listening'
  const q = copilot.current

  // A new question (asked, picked or heard) closes the Ask box and opens the answer.
  const newest = copilot.items[0]?.id
  const seen = useRef(newest)
  useEffect(() => {
    if (newest !== undefined && newest !== seen.current) {
      setAsking(false)
      setCollapsed(false)
    }
    seen.current = newest
  }, [newest])
  useEffect(() => {
    if (asking) requestAnimationFrame(() => input.current?.focus())
  }, [asking])

  const state: { label: string; tone: 'teal' | 'orange' | 'muted'; icon: ReactNode } =
    q?.status === 'answering'
      ? { label: 'Processing', tone: 'orange', icon: <Loader2 size={12} className="animate-spin" /> }
      : listening && copilot.heard.partial
        ? { label: 'Hearing a question', tone: 'teal', icon: <Mic size={12} /> }
        : q?.status === 'done' && q.answer
          ? { label: 'Answer ready', tone: 'orange', icon: <Check size={12} /> }
          : listening
            ? { label: 'Listening', tone: 'teal', icon: <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse-dot" /> }
            : copilot.listen === 'starting'
              ? { label: 'Connecting', tone: 'muted', icon: <Loader2 size={12} className="animate-spin" /> }
              : { label: 'Ready', tone: 'muted', icon: null }

  const submit = (text = draft) => {
    if (!text.trim()) return
    copilot.ask(text)
    setDraft('')
  }
  const answerNow = () => {
    if (!copilot.answerNow()) setAsking(true)
  }

  // Drag the panel by its grip.
  const startDrag = (e: ReactPointerEvent) => {
    if (!onDrag) return
    e.preventDefault()
    let x = e.clientX
    let y = e.clientY
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      onDrag(ev.clientX - x, ev.clientY - y)
      x = ev.clientX
      y = ev.clientY
    }
    const up = () => {
      target.removeEventListener('pointermove', move as EventListener)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move as EventListener)
    target.addEventListener('pointerup', up)
  }

  const showBody = !collapsed
  return (
    <div
      className={`selectable flex min-h-0 flex-col overflow-hidden text-white ${compact ? '' : 'rounded-2xl border border-white/10 shadow-[0_18px_50px_-10px_rgba(0,0,0,0.65)] backdrop-blur-xl'}`}
      style={compact ? undefined : { background: `rgb(24 25 29 / ${Math.round(si.opacity * 100)}%)` }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-1.5 pr-1.5 pl-1" style={{ height: SI_HEADER_H }}>
        {onDrag && (
          <button
            type="button"
            title="Drag to move · double-click to put back"
            onPointerDown={startDrag}
            onDoubleClick={onResetPosition}
            className="flex h-7 w-4 cursor-grab touch-none items-center justify-center text-white/25 hover:text-white/60 active:cursor-grabbing"
          >
            <GripVertical size={14} />
          </button>
        )}
        {platform.kind === 'web' ? (
          <button
            type="button"
            disabled={!canAsk || !aiReady || copilot.listen === 'starting'}
            onClick={() => void (listening ? copilot.stopListening() : copilot.startListening())}
            title={
              !aiReady ? 'Connect your AI first' : listening ? 'Stop listening to the call' : 'Listen to the call — share the meeting tab with “Also share tab audio”'
            }
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition disabled:opacity-35 ${
              listening ? 'bg-teal-400/15 text-teal-300' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Headphones size={15} />
          </button>
        ) : (
          <span className="flex h-7 w-7 items-center justify-center text-white/40" title="Listening to calls works in the web app">
            <Headphones size={15} />
          </span>
        )}
        <span className="flex items-center gap-1 text-[12.5px] font-semibold text-orange-300">
          <Sparkles size={12} /> SI
        </span>
        <span
          className={`ml-1 flex min-w-0 items-center gap-1.5 truncate text-[12px] ${
            state.tone === 'teal' ? 'text-teal-300' : state.tone === 'orange' ? 'text-orange-300' : 'text-white/45'
          }`}
        >
          {state.icon}
          {!compact && state.label}
        </span>
        <div className="flex-1" />
        {canAsk && aiReady && (
          <>
            <HeaderButton active={asking} title="Type a question" onClick={() => setAsking((v) => !v)}>
              Ask
            </HeaderButton>
            <HeaderButton title={`Answer what was just asked (${mod}↵)`} onClick={answerNow}>
              Answer{!compact && <kbd className="ml-1 font-sans text-[10px] text-white/40">{mod}↵</kbd>}
            </HeaderButton>
          </>
        )}
        {copilot.items.length > 1 && !compact && (
          <span className="flex items-center text-[11px] text-white/45 tabular">
            <IconButton title={`Older (${mod}←)`} disabled={copilot.index >= copilot.items.length - 1} onClick={copilot.older}>
              <ChevronLeft size={13} />
            </IconButton>
            {copilot.items.length - copilot.index}/{copilot.items.length}
            <IconButton title={`Newer (${mod}→)`} disabled={copilot.index === 0} onClick={copilot.newer}>
              <ChevronRight size={13} />
            </IconButton>
          </span>
        )}
        <IconButton title={collapsed ? 'Show the answer' : 'Collapse'} onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </IconButton>
        {onClose && (
          <IconButton title="Hide SI (Q)" onClick={onClose}>
            <X size={14} />
          </IconButton>
        )}
      </div>

      {/* Body */}
      {showBody && (
        <div className={`min-h-0 overflow-y-auto border-t border-white/[0.07] ${compact ? 'px-3 py-2' : 'px-4 py-3'}`} style={compact ? undefined : { maxHeight: '38vh' }}>
          {!canAsk ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1 text-[12.5px] leading-relaxed text-white/70">
                {!session
                  ? 'Sign in to use SI — it hears questions on your call and tells you what to answer.'
                  : `Live answers come with the SI plan ($${PLANS.si_monthly.price}/month or $${PLANS.si_yearly.price}/year).`}
              </p>
              <Button size="sm" variant="primary" onClick={() => openSite(session ? '/account?plan=si_monthly' : '/login')}>
                {session ? 'Upgrade to SI' : 'Sign in'}
              </Button>
            </div>
          ) : !aiReady || connecting ? (
            <ConnectAi
              onDone={() => {
                setConnecting(false)
                // A question that failed for want of a key gets its answer now.
                if (q?.status === 'error' && q.code === 'AI_NOT_CONFIGURED') copilot.answerItem(q)
              }}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {copilot.notice && (
                <div className="flex items-start gap-2 rounded-lg bg-danger/12 px-2.5 py-1.5 text-[12px] leading-snug text-white/85">
                  <span className="flex-1">{copilot.notice}</span>
                  <button type="button" onClick={copilot.dismissNotice} className="text-white/50 hover:text-white">
                    <X size={12} />
                  </button>
                </div>
              )}
              {listening && copilot.heard.partial && (
                <p className="flex items-start gap-1.5 text-[12px] leading-snug text-teal-200/80 italic">
                  <Mic size={12} className="mt-0.5 shrink-0" /> {copilot.heard.partial}
                </p>
              )}
              {asking ? (
                <AskBox copilot={copilot} draft={draft} setDraft={setDraft} submit={submit} input={input} close={() => setAsking(false)} />
              ) : q ? (
                <QuestionAnswer
                  q={q}
                  copilot={copilot}
                  textSize={si.textSize}
                  highlight={si.highlightStyle}
                  transitionMs={transitionMs}
                  onConnect={() => setConnecting(true)}
                />
              ) : (
                !(listening && copilot.heard.partial) && (
                  <p className="text-[12.5px] leading-relaxed text-white/50">
                    {listening
                      ? 'Listening. When someone asks a question, the answer appears here.'
                      : platform.kind === 'web'
                        ? 'Click the headphones to listen to your call, or Ask to type a question.'
                        : 'Click Ask to type a question.'}
                  </p>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const QUICK_PROVIDERS: OwnKeyProvider[] = ['anthropic', 'openai', 'gemini', 'groq', 'openrouter']

/** Connect an AI provider without leaving the presentation: pick one, paste the key. */
function ConnectAi({ onDone }: { onDone: () => void }) {
  const si = useSettings((s) => s.settings.si)
  const update = useSettings((s) => s.update)
  const [provider, setProvider] = useState<OwnKeyProvider>(QUICK_PROVIDERS.includes(si.provider) ? si.provider : 'anthropic')
  const [key, setKey] = useState(() => si.keys[provider])
  const info = PROVIDERS[provider]
  const save = () => {
    if (!key.trim()) return
    update('si', { provider, keys: { ...si.keys, [provider]: key.trim() } })
    onDone()
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-white/70">
        <PlugZap size={14} className="mt-0.5 shrink-0 text-orange-300" />
        <span>
          <b className="font-semibold text-white">Connect your AI to get answers.</b> Paste an API key — it stays on this device, and you pay the provider
          directly, with no daily cap.
        </span>
      </p>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <select
          value={provider}
          onChange={(e) => {
            const p = e.target.value as OwnKeyProvider
            setProvider(p)
            setKey(si.keys[p])
          }}
          className="h-8 shrink-0 rounded-lg border border-white/10 bg-[#202127] px-2 text-[12.5px] text-white outline-none focus:border-orange-400/50"
        >
          {QUICK_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDERS[p].label}
            </option>
          ))}
        </select>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={info.keyPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 font-mono text-[12px] text-white outline-none placeholder:font-sans placeholder:text-white/35 focus:border-orange-400/50"
        />
        <Button size="sm" variant="primary" type="submit" disabled={!key.trim()}>
          Connect
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-white/45">
        {info.keyUrl && (
          <button type="button" onClick={() => void platform.openExternal(info.keyUrl!).catch(() => null)} className="flex items-center gap-1 hover:text-white">
            Get an API key from {info.label.replace(/ \(.*\)$/, '')} <ExternalLink size={11} />
          </button>
        )}
        <span>Other providers and a connection test: Settings → SI</span>
        {ownKeyReady(si) && (
          <button type="button" onClick={onDone} className="ml-auto hover:text-white">
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function AskBox({
  copilot,
  draft,
  setDraft,
  submit,
  input,
  close,
}: {
  copilot: Copilot
  draft: string
  setDraft: (v: string) => void
  submit: (text?: string) => void
  input: React.RefObject<HTMLInputElement | null>
  close: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/25 pr-1 pl-3 focus-within:border-orange-400/50"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              close()
            }
          }}
          placeholder="Ask about your pitch…"
          className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/35"
        />
        <button
          type="submit"
          title="Ask (Enter)"
          disabled={!draft.trim()}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg hover:brightness-110 disabled:bg-white/10 disabled:text-white/30"
        >
          <Send size={13} />
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-1.5">
        {copilot.suggestions.questions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => submit(s)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-left text-[12px] leading-snug text-white/80 hover:border-orange-400/40 hover:text-white"
          >
            {s}
          </button>
        ))}
        {copilot.suggestions.loading ? (
          <Loader2 size={12} className="animate-spin text-white/40" />
        ) : (
          <button type="button" title="Other suggestions" onClick={copilot.refreshSuggestions} className="rounded p-1 text-white/40 hover:text-white">
            <RefreshCw size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function QuestionAnswer({
  q,
  copilot,
  textSize,
  highlight,
  transitionMs,
  onConnect,
}: {
  q: QA
  copilot: Copilot
  textSize: number
  highlight: HighlightStyle
  transitionMs: number
  onConnect: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-start gap-2 leading-snug text-white/75" style={{ fontSize: Math.max(11.5, textSize - 0.5) }}>
        <MessageSquare size={13} className="mt-[0.2em] shrink-0 text-white/40" />
        <span>{q.question}</span>
      </p>
      {q.status === 'error' ? (
        <div className="flex items-start gap-2 pl-[21px]">
          <p className="flex-1 text-[12.5px] leading-snug text-danger">{q.error}</p>
          {q.code === 'SI_REQUIRED' ? (
            <Button size="sm" variant="primary" onClick={() => openSite('/account?plan=si_monthly')}>
              Upgrade
            </Button>
          ) : q.code === 'AI_NOT_CONFIGURED' ? (
            <Button size="sm" variant="primary" onClick={onConnect}>
              Connect AI
            </Button>
          ) : (
            <IconButton title="Try again" onClick={() => copilot.answerItem(q)}>
              <RotateCcw size={13} />
            </IconButton>
          )}
        </div>
      ) : q.status === 'answering' ? (
        q.answer ? (
          <p className="pl-[21px] whitespace-pre-line text-white" style={{ fontSize: textSize, lineHeight: 1.6 }}>
            {q.answer}
            <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-orange-400 animate-pulse-dot" />
          </p>
        ) : (
          <p className="pl-[21px] text-[12.5px] text-white/45">Writing the answer…</p>
        )
      ) : q.answer && copilot.layout && copilot.current?.id === q.id ? (
        <div className="pl-[21px]">
          <AnswerText layout={copilot.layout} current={copilot.readIndex} style={highlight} fontSize={textSize} transitionMs={transitionMs} emphasize />
        </div>
      ) : (
        <div className="pl-[21px]">
          <Button size="sm" onClick={() => copilot.answerItem(q)}>
            Suggest an answer
          </Button>
        </div>
      )}
    </div>
  )
}

function HeaderButton({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 items-center rounded-lg px-2.5 text-[12px] font-medium transition ${active ? 'bg-white/15 text-white' : 'bg-white/[0.06] text-white/85 hover:bg-white/[0.12]'}`}
    >
      {children}
    </button>
  )
}

function IconButton({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick} className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white disabled:opacity-25">
      {children}
    </button>
  )
}
