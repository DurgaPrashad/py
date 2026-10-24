import { ArrowRight, Check, FileUp, Infinity as InfinityIcon, Loader2, Lock, Mic, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PLANS, SITE_URL } from '../../config'
import { useBuyPlan } from '../../pages/site/Pricing'
import type { Presentation } from '../../types'
import { ownKeyReady, PROVIDERS } from '../copilot/providers'
import { useSettings } from '../settings/settingsStore'
import { daysLeft, entitlements, useAccount } from './account'

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

/**
 * The top of the Presentations page: what your plan includes right now, what
 * it unlocks next, and your numbers. Everything is visible without a plan;
 * paid features show as locked with the plan that includes them.
 */
export function PlanDashboard({ items }: { items: Presentation[] | null }) {
  const navigate = useNavigate()
  const ready = useAccount((s) => s.ready)
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const si = useSettings((s) => s.settings.si)
  const ent = entitlements(profile)
  const { buy, busy } = useBuyPlan(null)

  const decks = items ?? []
  const slides = decks.reduce((n, p) => n + p.slides.length, 0)
  const scripted = decks.reduce((n, p) => n + p.slides.filter((s) => s.script.trim()).length, 0)
  const sources = decks.reduce((n, p) => n + (p.sources?.length ?? 0), 0)

  const until = ent.si ? profile?.si_until ?? null : ent.standard ? profile?.standard_until ?? null : null
  const left = daysLeft(until)
  const span = left > 31 ? 365 : 30

  let card: ReactNode
  if (ready && !session) {
    card = (
      <PlanCard tone="muted" eyebrow="Not signed in" title="Sign in to unlock presenting">
        <p className="text-[13px] leading-relaxed text-muted">
          Use the email you use on <span className="text-fg">{SITE_URL.replace('https://', '')}</span> — your plan comes with it.
        </p>
        <div className="mt-4 flex gap-2">
          <CardButton primary onClick={() => navigate('/login')}>
            Sign in
          </CardButton>
          <CardButton onClick={() => navigate('/signup')}>Create account</CardButton>
        </div>
      </PlanCard>
    )
  } else if (!ready || !profile) {
    card = (
      <PlanCard tone="muted" eyebrow="Your plan" title="Loading…">
        <Loader2 size={16} className="animate-spin text-subtle" />
      </PlanCard>
    )
  } else if (!ent.standard) {
    card = (
      <PlanCard tone="accent" eyebrow="No plan yet" title="Choose a plan to start presenting">
        <p className="text-[13px] leading-relaxed text-muted">Everything below is ready to explore. Presenting starts the moment your payment goes through.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <CardButton primary disabled={!!busy} onClick={() => void buy('si_monthly')}>
            {busy === 'si_monthly' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} SI · ${PLANS.si_monthly.price}/mo
          </CardButton>
          <CardButton disabled={!!busy} onClick={() => void buy('standard_monthly')}>
            {busy === 'standard_monthly' && <Loader2 size={13} className="animate-spin" />} Standard · ${PLANS.standard_monthly.price}/mo
          </CardButton>
          <button type="button" onClick={() => navigate('/account')} className="flex items-center gap-1 px-1 text-[12.5px] text-muted hover:text-fg">
            Yearly: unlimited presentations, up to 50% off <ArrowRight size={12} />
          </button>
        </div>
      </PlanCard>
    )
  } else {
    card = (
      <PlanCard
        tone={ent.si ? 'accent' : 'plain'}
        eyebrow={ent.si ? 'SI · Super Intelligence' : 'Standard'}
        title={`Active until ${fmtDate(until)}`}
        badge={`${left} day${left === 1 ? '' : 's'} left`}
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-hover">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, Math.min(100, (left / span) * 100))}%` }} />
        </div>
        <p className="mt-3 text-[12.5px] text-muted">
          {ent.si ? (
            ownKeyReady(si) ? (
              <>
                SI answers with <span className="text-fg">{PROVIDERS[si.provider].label}</span> (your key){' · '}
                <button type="button" onClick={() => navigate('/settings#si')} className="text-accent hover:underline">
                  Change
                </button>
              </>
            ) : (
              <>
                <span className="text-fg">One step left:</span> connect your AI so SI can answer.{' '}
                <button type="button" onClick={() => navigate('/settings#si')} className="text-accent hover:underline">
                  Connect AI
                </button>
              </>
            )
          ) : (
            'Your own script, following your voice.'
          )}
        </p>
        <p className="mt-1 text-[12.5px] text-subtle">
          {ent.presentationLimit === null ? 'Unlimited presentations with your yearly plan.' : `${ent.presentationLimit} presentations included · unlimited on any yearly plan.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <CardButton onClick={() => navigate('/account')}>Extend or manage</CardButton>
          {!ent.si && (
            <CardButton primary disabled={!!busy} onClick={() => void buy('si_monthly')}>
              {busy === 'si_monthly' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Add SI · ${PLANS.si_monthly.price}/mo
            </CardButton>
          )}
        </div>
      </PlanCard>
    )
  }

  return (
    <section className="mt-6">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {card}
        <div className="grid grid-cols-2 gap-3">
          <Stat
            value={ent.presentationLimit === null ? decks.length : `${decks.length}/${ent.presentationLimit}`}
            label={ent.presentationLimit === null ? 'Presentations · unlimited' : 'Presentations'}
            warn={ent.presentationLimit !== null && decks.length >= ent.presentationLimit}
          />
          <Stat value={slides} label="Slides" />
          <Stat value={slides ? `${scripted}/${slides}` : '0'} label="Slides with a script" />
          <Stat value={sources} label="SI sources" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Feature icon={<Mic size={15} />} title="Teleprompter & presenting on calls" on={ent.standard} lockedLabel="With Standard or SI" />
        <Feature icon={<Sparkles size={15} />} title="SI live answers on calls" on={ent.si} lockedLabel="With SI" />
        <Feature icon={<InfinityIcon size={15} />} title="Unlimited presentations" on={ent.yearly} lockedLabel="With any yearly plan" />
        <Feature icon={<FileUp size={15} />} title="Upload PDFs & docs as sources" on={ent.canUploadSources} lockedLabel="With SI yearly" />
      </div>
    </section>
  )
}

function PlanCard({ tone, eyebrow, title, badge, children }: { tone: 'accent' | 'plain' | 'muted'; eyebrow: string; title: string; badge?: string; children: ReactNode }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-5 ${
        tone === 'accent' ? 'border-accent/30 bg-[linear-gradient(135deg,var(--app-accent-soft),transparent_65%)]' : 'border-line bg-surface'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-semibold tracking-[0.12em] uppercase ${tone === 'accent' ? 'text-accent' : 'text-subtle'}`}>{eyebrow}</span>
        {badge && <span className="ml-auto rounded-full bg-hover px-2 py-0.5 text-[11px] text-muted tabular">{badge}</span>}
      </div>
      <h2 className="mt-1.5 mb-3 text-[18px] font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  )
}

function CardButton({ primary, disabled, onClick, children }: { primary?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition disabled:opacity-50 ${
        primary ? 'bg-accent text-accent-fg hover:brightness-110' : 'border border-line bg-elevated text-fg hover:bg-hover'
      }`}
    >
      {children}
    </button>
  )
}

function Stat({ value, label, warn }: { value: number | string; label: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className={`text-[22px] font-semibold tracking-tight tabular ${warn ? 'text-warning' : ''}`}>{value}</div>
      <div className="mt-0.5 text-[12px] text-subtle">{label}</div>
    </div>
  )
}

function Feature({ icon, title, on, lockedLabel }: { icon: ReactNode; title: string; on: boolean; lockedLabel: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${on ? 'border-line bg-surface' : 'border-dashed border-line bg-transparent'}`}>
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-accent-soft text-accent' : 'bg-hover text-subtle'}`}>{icon}</span>
      <div className="min-w-0">
        <div className={`text-[13px] leading-snug font-medium ${on ? 'text-fg' : 'text-muted'}`}>{title}</div>
        <div className={`mt-1 flex items-center gap-1 text-[11.5px] ${on ? 'text-success' : 'text-subtle'}`}>
          {on ? <Check size={12} /> : <Lock size={11} />} {on ? 'Included' : lockedLabel}
        </div>
      </div>
    </div>
  )
}
