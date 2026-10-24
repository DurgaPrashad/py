import { Check, Copy, Headphones, Keyboard, Loader2, RotateCcw, Send, Settings2, Sparkles, Square, X } from 'lucide-react'
import { useState } from 'react'
import { Button, IconButton } from '../../components/Button'
import { Toggle } from '../../components/controls'
import { SITE_URL } from '../../config'
import { platform } from '../../platform'
import { entitlements, useAccount } from '../account/account'
import { useSettings } from '../settings/settingsStore'
import { PROVIDERS } from './providers'
import type { Copilot, QA } from './useCopilot'

/** Opens a site page without leaving the presentation. */
function openSite(path: string) {
  void platform.openExternal(platform.kind === 'web' ? new URL(path, location.origin).href : `${SITE_URL}${path}`).catch(() => null)
}

/**
 * The SI (Super Intelligence) copilot: listens to the call, shows detected
 * questions and suggested answers. `side` is a full panel beside the slide;
 * `top` is a compact box under the top text bar; `strip` fits under the
 * floating teleprompter (latest answer only). Text size comes from Settings → SI.
 */
export function CopilotPanel({ copilot, variant, onClose }: { copilot: Copilot; variant: 'side' | 'top' | 'strip'; onClose?: () => void }) {
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)
  const provider = useSettings((s) => s.settings.si.provider)
  const model = useSettings((s) => (s.settings.si.provider === 'reflex' ? '' : s.settings.si.models[s.settings.si.provider]))
  const textSize = useSettings((s) => s.settings.si.textSize)
  const [draft, setDraft] = useState('')
  const strip = variant === 'strip'
  const compact = variant !== 'side'
  const { listen, caption, items } = copilot
  const shown = strip ? items.slice(0, 1) : items

  const submit = () => {
    if (!draft.trim()) return
    copilot.ask(draft)
    setDraft('')
  }

  const header = (
    <div className="flex shrink-0 items-center gap-2">
      <Sparkles size={14} className="text-accent" />
      <span className="text-[13px] font-semibold">SI copilot</span>
      {session && profile && (
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">
          {ent.si ? 'SI' : `${ent.freeAnswersLeft} free left`}
        </span>
      )}
      <div className="flex-1" />
      {!strip && (
        <span className="max-w-[120px] truncate text-[10.5px] text-subtle" title={provider === 'reflex' ? 'Built-in AI' : `${PROVIDERS[provider].label} · ${model} · your API key`}>
          {provider === 'reflex' ? 'Built-in AI' : model || PROVIDERS[provider].label}
        </span>
      )}
      {!strip && (
        <IconButton label="SI settings — AI provider, text size, transparency" size="sm" onClick={() => openSite('/settings#si')}>
          <Settings2 size={13} />
        </IconButton>
      )}
      {!strip && items.length > 0 && (
        <button type="button" onClick={copilot.clear} className="text-[11.5px] text-subtle hover:text-fg">
          Clear
        </button>
      )}
      {onClose && (
        <IconButton label="Close copilot (Q)" size="sm" onClick={onClose}>
          <X size={14} />
        </IconButton>
      )}
    </div>
  )

  if (!session) {
    return (
      <Shell variant={variant}>
        {header}
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          Sign in to use SI — Super Intelligence suggests answers to the questions asked on your call.
        </p>
        <Button size="sm" variant="primary" className="mt-3 self-start" onClick={() => openSite('/login')}>
          Sign in
        </Button>
      </Shell>
    )
  }

  const listenRow =
    platform.kind !== 'web' ? null : listen.state === 'listening' ? (
      <div className="flex min-w-0 items-center gap-2 rounded-lg bg-danger/10 px-2.5 py-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-danger animate-pulse-dot" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg" title={caption}>
          {caption || 'Listening to the call…'}
        </span>
        <IconButton label="Stop listening" size="sm" className="!h-6 !w-6" onClick={() => void copilot.stopListening()}>
          <Square size={11} fill="currentColor" />
        </IconButton>
      </div>
    ) : (
      <div className="flex flex-col gap-1.5">
        <Button
          size="sm"
          variant={compact ? 'secondary' : 'primary'}
          icon={listen.state === 'starting' ? <Loader2 size={13} className="animate-spin" /> : <Headphones size={13} />}
          disabled={listen.state === 'starting' || !ent.canAsk}
          onClick={() => void copilot.startListening()}
          className="self-start"
        >
          {listen.state === 'starting' ? 'Connecting…' : 'Listen to the call'}
        </Button>
        {listen.state === 'error' ? (
          <p className="text-[11.5px] leading-snug text-danger">{listen.message}</p>
        ) : (
          !compact && (
            <p className="text-[11.5px] leading-snug text-subtle">
              Pick the tab your Meet, Zoom or Teams call is in and switch on <span className="text-muted">“Also share tab audio”</span>. Audio is
              transcribed on this computer.
            </p>
          )
        )}
      </div>
    )

  return (
    <Shell variant={variant}>
      {header}
      {!ent.canAsk ? (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3">
          <p className="text-[12.5px] leading-relaxed text-fg">AI answers on calls are part of the SI plan — $9/month or $69/year.</p>
          <Button size="sm" variant="primary" className="mt-2" onClick={() => openSite('/account?plan=si_monthly')}>
            Upgrade to SI
          </Button>
        </div>
      ) : (
        <div className={`flex shrink-0 flex-col gap-2 ${compact ? 'mt-1.5' : 'mt-3'}`}>
          {listenRow}
          {!compact && (
            <label className="flex items-center gap-2 text-[11.5px] text-muted">
              <Toggle checked={copilot.autoAnswer} onChange={copilot.setAutoAnswer} label="Answer detected questions automatically" />
              Answer detected questions automatically
            </label>
          )}
        </div>
      )}

      <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? 'mt-1.5' : 'mt-3'} flex flex-col gap-2`}>
        {shown.length === 0 && !strip && (
          <p className={`text-center text-[12px] leading-relaxed text-subtle ${compact ? 'py-2' : 'py-6'}`}>
            Questions you type or hear on the call appear here with a suggested answer from your deck, notes and sources.
          </p>
        )}
        {shown.map((q) => (
          <Card key={q.id} q={q} compact={compact} textSize={textSize} onAnswer={() => copilot.answerItem(q)} />
        ))}
      </div>

      {ent.canAsk && (
        <form
          className="mt-2 flex shrink-0 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a question…"
            className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 text-[12.5px] text-fg outline-none placeholder:text-subtle focus:border-accent/60"
          />
          <IconButton label="Ask" size="sm" disabled={!draft.trim()} onClick={submit}>
            <Send size={13} />
          </IconButton>
        </form>
      )}
    </Shell>
  )
}

function Shell({ variant, children }: { variant: 'side' | 'top' | 'strip'; children: React.ReactNode }) {
  const pad = variant === 'side' ? 'p-4' : variant === 'top' ? 'px-3.5 py-2.5' : 'px-3 pb-2'
  return <div className={`selectable flex h-full min-h-0 flex-col text-fg ${pad}`}>{children}</div>
}

function Card({ q, compact, textSize, onAnswer }: { q: QA; compact: boolean; textSize: number; onAnswer: () => void }) {
  const answerStyle = { fontSize: textSize, lineHeight: 1.55 }
  return (
    <div className={`rounded-xl border border-white/[0.08] bg-white/[0.04] ${compact ? 'px-3 py-2' : 'px-3.5 py-3'} animate-rise`}>
      <div className="flex items-start gap-1.5 leading-snug text-subtle" style={{ fontSize: Math.max(10.5, textSize - 2) }}>
        {q.source === 'call' ? <Headphones size={11} className="mt-0.5 shrink-0" /> : <Keyboard size={11} className="mt-0.5 shrink-0" />}
        <span className={compact ? 'line-clamp-2' : 'line-clamp-3'}>{q.question}</span>
      </div>
      {q.status === 'answering' && q.answer ? (
        <p className="mt-1 whitespace-pre-line text-fg" style={answerStyle}>
          {q.answer}
          <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-accent animate-pulse-dot" />
        </p>
      ) : q.status === 'answering' ? (
        <div className="mt-1.5 flex items-center gap-2 text-[12.5px] text-muted">
          <Loader2 size={13} className="animate-spin text-accent" /> Writing an answer…
        </div>
      ) : q.status === 'error' ? (
        <div className="mt-1.5 flex items-start gap-2">
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
            <IconButton label="Try again" size="sm" onClick={onAnswer}>
              <RotateCcw size={12} />
            </IconButton>
          )}
        </div>
      ) : q.answer ? (
        <div className="group/answer relative">
          <p className="mt-1 pr-6 whitespace-pre-line text-fg" style={answerStyle}>
            {q.answer}
          </p>
          <CopyButton text={q.answer} />
        </div>
      ) : (
        <Button size="sm" className="mt-1.5" onClick={onAnswer}>
          Suggest an answer
        </Button>
      )}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title="Copy answer"
      aria-label="Copy answer"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
      className="absolute top-0 right-0 rounded-md p-1 text-subtle opacity-0 transition-opacity group-hover/answer:opacity-100 hover:bg-hover hover:text-fg"
    >
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  )
}
