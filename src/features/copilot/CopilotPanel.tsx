import {
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Headphones,
  Keyboard,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Star,
} from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '../../components/Button'
import { SITE_URL } from '../../config'
import { platform } from '../../platform'
import { entitlements, useAccount } from '../account/account'
import type { HighlightStyle } from '../../types'
import { useSettings } from '../settings/settingsStore'
import { AnswerText } from './AnswerText'
import { PROVIDERS } from './providers'
import type { Copilot, QA } from './useCopilot'

/** Opens a site page without leaving the presentation. */
function openSite(path: string) {
  void platform.openExternal(platform.kind === 'web' ? new URL(path, location.origin).href : `${SITE_URL}${path}`).catch(() => null)
}

const mod = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl '

/**
 * The SI (Super Intelligence) overlay: a slim toolbar, the live call
 * transcript as word chips, and the current question with its answer — the
 * word you're reading highlighted as you say it. Each part is a translucent
 * glass card (opacity, text size and highlight style from Settings → SI).
 * `top` sits under the top text bar, `side` beside the slide, `strip` in the
 * floating window.
 */
export function CopilotPanel({ copilot, variant, onClose }: { copilot: Copilot; variant: 'side' | 'top' | 'strip'; onClose?: () => void }) {
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)
  const si = useSettings((s) => s.settings.si)
  const transitionMs = useSettings((s) => s.settings.teleprompter.transitionMs)
  const [chat, setChat] = useState(false)
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const compact = variant === 'strip'
  const glass: CSSProperties = { background: `rgb(14 14 17 / ${Math.round(si.opacity * 100)}%)` }
  const listening = copilot.listen.state === 'listening'
  const model = si.provider === 'reflex' ? 'Built-in AI' : si.models[si.provider] || PROVIDERS[si.provider].label

  const submit = () => {
    if (!draft.trim()) return
    copilot.ask(draft)
    setDraft('')
  }
  const answerNow = () => {
    if (!copilot.answerNow()) setChat(true)
  }

  const toolbar = (
    <Glass style={glass} className="flex items-center gap-1 p-1">
      {platform.kind === 'web' && (
        <ToolButton
          title={listening ? 'Stop listening to the call' : 'Listen to the call — share the meeting tab with “Also share tab audio”'}
          active={listening}
          disabled={!session || !ent.canAsk || copilot.listen.state === 'starting'}
          onClick={() => void (listening ? copilot.stopListening() : copilot.startListening())}
        >
          {copilot.listen.state === 'starting' ? <Loader2 size={14} className="animate-spin" /> : <Headphones size={14} />}
          {listening && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-danger animate-pulse-dot" />}
        </ToolButton>
      )}
      <ToolChip title={`Answer what was just asked (${mod}↵)`} disabled={!session || !ent.canAsk} onClick={answerNow}>
        Answer {!compact && <Kbd>{mod}↵</Kbd>}
      </ToolChip>
      <ToolChip title="Type a question" active={chat} disabled={!session || !ent.canAsk} onClick={() => setChat((v) => !v)}>
        <Keyboard size={13} /> {!compact && 'Ask'}
      </ToolChip>
      <div className="flex-1" />
      {session && profile && !compact && (
        <span className="mr-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap text-accent" title={model}>
          <Sparkles size={10} className="mr-0.5 inline -translate-y-px" />
          {ent.si ? 'SI' : `${ent.freeAnswersLeft} free`}
        </span>
      )}
      {!compact && (
        <ToolButton title="SI settings — AI provider, size, transparency, highlight" onClick={() => openSite('/settings#si')}>
          <Settings2 size={14} />
        </ToolButton>
      )}
      <ToolButton title={collapsed ? 'Show answers' : 'Collapse to the toolbar'} onClick={() => setCollapsed((v) => !v)}>
        {collapsed ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
      </ToolButton>
      {onClose && (
        <button
          type="button"
          title="Hide SI (Q)"
          onClick={onClose}
          className="h-7 rounded-lg bg-danger/85 px-2.5 text-[12px] font-semibold text-white transition hover:bg-danger"
        >
          Hide
        </button>
      )}
    </Glass>
  )

  if (!session || !ent.canAsk) {
    return (
      <Stack variant={variant}>
        {toolbar}
        <Glass style={glass} className="p-3.5">
          <p className="text-[12.5px] leading-relaxed text-white/80">
            {!session
              ? 'Sign in to use SI — Super Intelligence tells you what to answer when someone asks a question.'
              : 'AI answers on calls are part of the SI plan — $9/month or $69/year.'}
          </p>
          <Button size="sm" variant="primary" className="mt-2.5" onClick={() => openSite(session ? '/account?plan=si_monthly' : '/login')}>
            {session ? 'Upgrade to SI' : 'Sign in'}
          </Button>
        </Glass>
      </Stack>
    )
  }

  const heardWords = [...copilot.heard.final, copilot.heard.partial].join(' ').split(/\s+/).filter(Boolean)
  const liveFrom = heardWords.length - copilot.heard.partial.split(/\s+/).filter(Boolean).length
  const chips: { text: string; live: boolean }[] = []
  for (let i = Math.max(0, heardWords.length - 30); i < heardWords.length; i += 3) {
    chips.push({ text: heardWords.slice(i, i + 3).join(' '), live: i + 2 >= liveFrom && copilot.heard.partial !== '' })
  }
  const showTranscript = !collapsed && (listening || chips.length > 0 || copilot.listen.state === 'error' || copilot.listen.state === 'starting')
  const q = copilot.current

  return (
    <Stack variant={variant}>
      {toolbar}

      {showTranscript && (
        <Glass style={glass} className="flex items-center gap-2 py-1.5 pr-1.5 pl-2.5">
          <AudioLines size={15} className={`shrink-0 ${listening ? 'text-success' : 'text-subtle'}`} />
          <div className="flex min-w-0 flex-1 justify-end gap-1.5 overflow-hidden whitespace-nowrap">
            {copilot.listen.state === 'error' ? (
              <span className="truncate text-[12px] text-danger" title={copilot.listen.message}>
                {copilot.listen.message}
              </span>
            ) : copilot.listen.state === 'starting' ? (
              <span className="text-[12px] text-subtle">Connecting to the call…</span>
            ) : chips.length === 0 ? (
              <span className="text-[12px] text-subtle">Listening to the call…</span>
            ) : (
              chips.map((c, i) => (
                <span key={i} className={`shrink-0 rounded-md px-2 py-0.5 text-[12px] ${c.live ? 'bg-white/20 text-white' : 'bg-white/[0.08] text-white/75'}`}>
                  {c.text}
                </span>
              ))
            )}
          </div>
          <button type="button" onClick={copilot.clearTranscript} className="shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] text-white/60 hover:bg-white/10 hover:text-white">
            Clear
          </button>
        </Glass>
      )}

      {chat && !collapsed && (
        <Glass style={glass} className="p-1.5">
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setChat(false))}
              placeholder="Type a question and press Enter…"
              className="h-8 min-w-0 flex-1 rounded-lg bg-black/30 px-2.5 text-[13px] text-white outline-none placeholder:text-white/40"
            />
            <button type="button" title="Ask" disabled={!draft.trim()} onClick={submit} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30">
              <Send size={14} />
            </button>
          </form>
        </Glass>
      )}

      {!collapsed &&
        (q ? (
          <Glass style={glass} className={`flex min-h-0 flex-col ${variant === 'side' ? 'flex-1' : ''}`}>
            <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
              <NavButton title={`Older answer (${mod}←)`} disabled={copilot.index >= copilot.items.length - 1} onClick={copilot.older}>
                <ChevronLeft size={13} />
              </NavButton>
              <NavButton title={`Newer answer (${mod}→)`} disabled={copilot.index === 0} onClick={copilot.newer}>
                <ChevronRight size={13} />
              </NavButton>
              <span className="ml-1 text-[11px] text-white/45 tabular">
                {copilot.items.length - copilot.index} / {copilot.items.length}
              </span>
              <div className="flex-1" />
              <button type="button" onClick={copilot.clear} className="rounded-md px-1.5 py-0.5 text-[11.5px] text-white/60 hover:bg-white/10 hover:text-white">
                Clear
              </button>
              {!compact && (
                <NavButton title={expanded ? 'Smaller' : 'Bigger'} onClick={() => setExpanded((v) => !v)}>
                  {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                </NavButton>
              )}
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-2 pb-3"
              style={variant === 'side' ? undefined : { maxHeight: expanded ? '70vh' : compact ? undefined : '34vh' }}
            >
              <QuestionLine q={q} size={si.textSize} />
              <div className="mt-2 border-t border-white/[0.08] pt-2">
                <AnswerBody q={q} copilot={copilot} size={si.textSize} highlight={si.highlightStyle} transitionMs={transitionMs} />
              </div>
              {q.status === 'done' && q.answer && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-white/40">
                  <span>
                    Answer · {new Date(q.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {!compact && <span className="truncate">· {model}</span>}
                  {si.followVoice && !compact && <span className="ml-auto whitespace-nowrap">The highlight follows your voice</span>}
                </div>
              )}
            </div>
          </Glass>
        ) : (
          !listening &&
          !chat && (
            <Glass style={glass} className="px-3.5 py-2.5">
              <p className="text-[12px] leading-relaxed text-white/60">
                {platform.kind === 'web' ? 'Click the headphones to listen to the call, or ' : ''}
                press <b className="font-semibold text-white/80">Ask</b> to type a question. Answers come from your deck, notes and sources.
              </p>
            </Glass>
          )
        ))}
    </Stack>
  )
}

function QuestionLine({ q, size }: { q: QA; size: number }) {
  return (
    <div className="group/q relative flex items-start gap-2 pr-6" style={{ fontSize: Math.max(11, size - 1), lineHeight: 1.5 }}>
      <MessageSquare size={13} className="mt-[0.3em] shrink-0 text-white/50" />
      <p className="text-white/85">
        <b className="font-semibold text-white">Question:</b> {q.question}
      </p>
      <CopyButton text={q.question} />
    </div>
  )
}

function AnswerBody({ q, copilot, size, highlight, transitionMs }: { q: QA; copilot: Copilot; size: number; highlight: HighlightStyle; transitionMs: number }) {
  const label = (
    <span className="mr-1 inline-flex items-center gap-1 font-semibold text-white">
      <Star size={12} className="text-amber-400" fill="currentColor" /> Answer:
    </span>
  )
  if (q.status === 'error') {
    return (
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
    )
  }
  if (q.status === 'answering') {
    return q.answer ? (
      <p className="whitespace-pre-line text-white" style={{ fontSize: size, lineHeight: 1.6 }}>
        {label}
        {q.answer}
        <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent animate-pulse-dot" />
      </p>
    ) : (
      <div className="flex items-center gap-2 text-[12.5px] text-white/60">
        <Loader2 size={13} className="animate-spin text-accent" /> Writing an answer…
      </div>
    )
  }
  if (!q.answer || !copilot.layout || copilot.current?.id !== q.id) {
    return (
      <Button size="sm" onClick={() => copilot.answerItem(q)}>
        Suggest an answer
      </Button>
    )
  }
  return (
    <div className="group/q relative pr-6">
      <div className="mb-0.5" style={{ fontSize: size }}>
        {label}
      </div>
      <AnswerText layout={copilot.layout} current={copilot.readIndex} style={highlight} fontSize={size} transitionMs={transitionMs} />
      <CopyButton text={q.answer} />
    </div>
  )
}

function Stack({ variant, children }: { variant: 'side' | 'top' | 'strip'; children: ReactNode }) {
  return <div className={`selectable flex min-h-0 flex-col gap-1.5 text-white ${variant === 'side' ? 'h-full' : ''} ${variant === 'strip' ? 'p-1.5' : ''}`}>{children}</div>
}

function Glass({ style, className = '', children }: { style: CSSProperties; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl ${className}`} style={style}>
      {children}
    </div>
  )
}

function ToolButton({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-35 ${active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
    >
      {children}
    </button>
  )
}

function ToolChip({ title, active, disabled, onClick, children }: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium transition disabled:opacity-35 ${
        active ? 'bg-white/15 text-white' : 'bg-white/[0.07] text-white/90 hover:bg-white/[0.14]'
      }`}
    >
      {children}
    </button>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded bg-white/10 px-1 font-sans text-[10.5px] text-white/60">{children}</kbd>
}

function NavButton({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 min-w-6 items-center justify-center rounded-md bg-white/[0.07] px-1 text-white/70 hover:bg-white/[0.14] hover:text-white disabled:opacity-30"
    >
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
      className="absolute top-0 right-0 rounded-md p-1 text-white/40 opacity-0 transition-opacity group-hover/q:opacity-100 hover:bg-white/10 hover:text-white"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  )
}
