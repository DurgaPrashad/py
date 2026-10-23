import { Headphones, Keyboard, Loader2, RotateCcw, Send, Sparkles, Square, X } from 'lucide-react'
import { useState } from 'react'
import { Button, IconButton } from '../../components/Button'
import { Toggle } from '../../components/controls'
import { SITE_URL } from '../../config'
import { platform } from '../../platform'
import { entitlements, useAccount } from '../account/account'
import type { Copilot, QA } from './useCopilot'

/** Opens a site page without leaving the presentation. */
function openSite(path: string) {
  if (platform.kind === 'web') window.open(path, '_blank', 'noopener')
  else window.open(`${SITE_URL}${path}`, '_blank')
}

/**
 * The SI copilot: listens to the call, shows detected questions and suggested
 * answers. `side` is a panel beside the slide; `strip` fits under the floating
 * teleprompter (only the latest answer).
 */
export function CopilotPanel({ copilot, variant, onClose }: { copilot: Copilot; variant: 'side' | 'strip'; onClose?: () => void }) {
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)
  const [draft, setDraft] = useState('')
  const strip = variant === 'strip'
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
      <Shell strip={strip}>
        {header}
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">Sign in to use the SI copilot — it suggests answers to questions asked on your call.</p>
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
          variant={strip ? 'secondary' : 'primary'}
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
          !strip && (
            <p className="text-[11.5px] leading-snug text-subtle">
              Pick the tab your Meet, Zoom or Teams call is in and switch on <span className="text-muted">“Also share tab audio”</span>. Audio is
              transcribed on this computer.
            </p>
          )
        )}
      </div>
    )

  return (
    <Shell strip={strip}>
      {header}
      {!ent.canAsk ? (
        <div className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-3">
          <p className="text-[12.5px] leading-relaxed text-fg">AI answers on calls are part of the SI plan — $9/month or $69/year.</p>
          <Button size="sm" variant="primary" className="mt-2" onClick={() => openSite('/account?plan=si_monthly')}>
            Upgrade to SI
          </Button>
        </div>
      ) : (
        <div className={`flex shrink-0 flex-col gap-2 ${strip ? 'mt-1.5' : 'mt-3'}`}>
          {listenRow}
          {!strip && (
            <label className="flex items-center gap-2 text-[11.5px] text-muted">
              <Toggle checked={copilot.autoAnswer} onChange={copilot.setAutoAnswer} label="Answer detected questions automatically" />
              Answer detected questions automatically
            </label>
          )}
        </div>
      )}

      <div className={`min-h-0 flex-1 overflow-y-auto ${strip ? 'mt-1.5' : 'mt-3'} flex flex-col gap-2.5`}>
        {shown.length === 0 && !strip && (
          <p className="py-6 text-center text-[12px] leading-relaxed text-subtle">
            Questions you type or hear on the call appear here with a suggested answer from your deck and Q&A prep notes.
          </p>
        )}
        {shown.map((q) => (
          <Card key={q.id} q={q} strip={strip} onAnswer={() => copilot.answerItem(q)} />
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
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-app px-2.5 text-[12.5px] text-fg outline-none placeholder:text-subtle focus:border-accent/60"
          />
          <IconButton label="Ask" size="sm" disabled={!draft.trim()} onClick={submit}>
            <Send size={13} />
          </IconButton>
        </form>
      )}
    </Shell>
  )
}

function Shell({ strip, children }: { strip: boolean; children: React.ReactNode }) {
  return (
    <div className={`selectable flex h-full min-h-0 flex-col text-fg ${strip ? 'px-3 pb-2' : 'p-4'}`}>
      {children}
    </div>
  )
}

function Card({ q, strip, onAnswer }: { q: QA; strip: boolean; onAnswer: () => void }) {
  return (
    <div className={`rounded-xl border border-line bg-surface/80 ${strip ? 'px-3 py-2' : 'px-3.5 py-3'} animate-rise`}>
      <div className="flex items-start gap-1.5 text-[11.5px] leading-snug text-subtle">
        {q.source === 'call' ? <Headphones size={11} className="mt-0.5 shrink-0" /> : <Keyboard size={11} className="mt-0.5 shrink-0" />}
        <span className={strip ? 'line-clamp-1' : 'line-clamp-3'}>{q.question}</span>
      </div>
      {q.status === 'answering' ? (
        <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
          <Loader2 size={13} className="animate-spin text-accent" /> Writing an answer…
        </div>
      ) : q.status === 'error' ? (
        <div className="mt-2 flex items-start gap-2">
          <p className="flex-1 text-[12.5px] leading-snug text-danger">{q.error}</p>
          {q.code === 'SI_REQUIRED' ? (
            <Button size="sm" variant="primary" onClick={() => openSite('/account?plan=si_monthly')}>
              Upgrade
            </Button>
          ) : (
            <IconButton label="Try again" size="sm" onClick={onAnswer}>
              <RotateCcw size={12} />
            </IconButton>
          )}
        </div>
      ) : q.answer ? (
        <p className={`mt-1.5 leading-relaxed whitespace-pre-line text-fg ${strip ? 'text-[14px]' : 'text-[14.5px]'}`}>{q.answer}</p>
      ) : (
        <Button size="sm" className="mt-2" onClick={onAnswer}>
          Suggest an answer
        </Button>
      )}
    </div>
  )
}
