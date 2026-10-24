import { ArrowRight, Check, Infinity as InfinityIcon, Loader2, Lock, Presentation, RefreshCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../../components/Toast'
import { PLANS, planFor, PRESENTATION_LIMIT, SITE_URL, TIER_NAME, type PlanId, type Tier } from '../../config'
import { entitlements, useAccount } from '../../features/account/account'
import { checkout } from '../../features/account/checkout'
import { platform } from '../../platform'
import { errorMessage } from '../../services/tauri'
import { PageHeader, SiteShell } from './SiteShell'


/**
 * Starts checkout for a plan, sending signed-out visitors to sign-up first.
 * After paying: go to `afterPaid` (default: the account page), or stay put with null.
 */
export function useBuyPlan(afterPaid: string | null = '/account?paid=1') {
  const navigate = useNavigate()
  const session = useAccount((s) => s.session)
  const setProfile = useAccount((s) => s.setProfile)
  const [busy, setBusy] = useState<PlanId | null>(null)

  const buy = async (plan: PlanId) => {
    if (!session) {
      navigate(`/signup?plan=${plan}`)
      return
    }
    if (platform.kind === 'desktop') {
      // Payments run on the website; the plan follows the account into the app.
      await platform.openExternal(`${SITE_URL}/account?plan=${plan}`).catch(() => null)
      toast('Opened checkout in your browser. Your plan appears here as soon as the payment goes through.', 'info')
      return
    }
    setBusy(plan)
    try {
      const res = await checkout(plan)
      if (res.status === 'paid') {
        setProfile(res.profile)
        toast(`Payment received — ${PLANS[plan].tier === 'si' ? 'SI' : 'Standard'} is active. Thank you!`, 'success')
        if (afterPaid !== null) navigate(afterPaid)
      }
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setBusy(null)
    }
  }
  return { buy, busy }
}

type Billing = 'month' | 'year'

/** What each card promises, by tier and billing period. Lead with the outcome, then the limit. */
const LIMIT_LINE: Record<Tier, Record<Billing, string>> = {
  standard: { month: `${PRESENTATION_LIMIT.standard} presentations`, year: 'Unlimited presentations' },
  si: { month: `${PRESENTATION_LIMIT.si} presentations`, year: 'Unlimited presentations + upload PDFs & docs as sources' },
}

const STANDARD_FEATURES = [
  'Your script follows your voice, word by word — you never lose your place',
  'Sits right under your camera, so you keep eye contact instead of reading notes',
  'Present on Google Meet, Zoom & Teams — the audience sees only your slides',
  'Import PDF & PowerPoint, with private on-device speech recognition',
  'Unlimited presenting time and rehearsals · web app + Mac app',
]

const SI_FEATURES = [
  'Hears the question on the call and shows you an answer in seconds',
  'Answers only from your deck, notes and sources — it never invents numbers',
  'Ask anything mid-call, or pick from questions it expects on each slide',
  'Drafts a natural speaking script for any slide',
  'Runs on your own AI key — Claude, OpenAI, Gemini, Groq, OpenRouter or any OpenAI-compatible API. No daily caps, no markup.',
]

const TAGLINE: Record<Tier, string> = {
  standard: 'For presenters who know what to say and want to say it without notes.',
  si: 'For pitches, demos and interviews where the hard questions decide the outcome.',
}

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, '')}`

export function PricingTable({ afterPaid }: { afterPaid?: string | null }) {
  // Yearly first: it is the better deal for almost everyone, and it removes the presentation limit.
  const [billing, setBilling] = useState<Billing>('year')
  const { buy, busy } = useBuyPlan(afterPaid)
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)

  const plan = (tier: Tier) => PLANS[planFor(tier, billing)]
  const saving = (tier: Tier) => Math.round((1 - PLANS[planFor(tier, 'year')].price / (PLANS[planFor(tier, 'month')].price * 12)) * 100)

  const card = (tier: Tier) => {
    const p = plan(tier)
    const si = tier === 'si'
    const name = TIER_NAME[tier]
    const current = si ? ent.si : ent.standard && !ent.si
    return (
      <div
        className={`relative flex flex-col rounded-3xl bg-white p-7 ${
          si ? 'border-2 border-orange-500 shadow-[0_20px_60px_rgba(232,101,15,0.14)]' : 'border border-slate-200'
        }`}
      >
        {si && (
          <span className="absolute -top-3.5 left-7 inline-flex items-center gap-1 rounded-full bg-orange-600 px-3 py-1 text-[12px] font-semibold text-white">
            <Sparkles size={12} /> Recommended for pitches
          </span>
        )}
        <div className="flex items-center justify-between">
          <h3 className="text-[17px] font-semibold">{name}</h3>
          <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${si ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>
            {si ? 'Teleprompter + AI copilot' : 'Teleprompter'}
          </span>
        </div>
        <p className="mt-1.5 min-h-[40px] text-[13.5px] leading-snug text-slate-500">{TAGLINE[tier]}</p>

        <div className="mt-5 flex items-baseline gap-1.5">
          <span className="text-[46px] leading-none font-semibold tracking-tight">{money(billing === 'year' ? p.price / 12 : p.price)}</span>
          <span className="text-[14px] text-slate-500">/ month</span>
          {billing === 'year' && (
            <span className="ml-1 text-[15px] text-slate-400 line-through decoration-slate-300">{money(PLANS[planFor(tier, 'month')].price)}</span>
          )}
        </div>
        <p className="mt-2 h-5 text-[13px] text-slate-500">
          {billing === 'year' ? (
            <>
              {money(p.price)} once for the whole year · <span className="font-medium text-emerald-700">save {saving(tier)}%</span>
            </>
          ) : (
            'Paid monthly · no subscription'
          )}
        </p>

        <button
          type="button"
          disabled={!!busy}
          onClick={() => void buy(p.id)}
          className={`mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition disabled:opacity-60 ${
            si ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/25 hover:bg-orange-700' : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          {busy === p.id && <Loader2 size={16} className="animate-spin" />}
          {current ? `Extend ${name}` : `Get ${name}`} · {money(p.price)}
          {billing === 'year' ? ' / year' : ''}
          {!busy && <ArrowRight size={16} />}
        </button>
        {billing === 'month' ? (
          <button
            type="button"
            onClick={() => setBilling('year')}
            className="mt-2.5 text-[12.5px] font-medium text-emerald-700 hover:underline"
          >
            Go yearly: unlimited presentations for {money(PLANS[planFor(tier, 'year')].price / 12)}/month →
          </button>
        ) : (
          <p className="mt-2.5 text-center text-[12.5px] text-slate-500">
            {si ? `About ${Math.round((p.price / 365) * 100)}¢ a day to have an answer ready for every question.` : 'Less than one coffee a month.'}
          </p>
        )}

        <div
          className={`mt-5 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold ${
            billing === 'year' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {billing === 'year' ? <InfinityIcon size={16} /> : <Presentation size={15} />}
          {LIMIT_LINE[tier][billing]}
        </div>

        {si && <p className="mt-5 text-[13px] font-semibold text-slate-900">Everything in Standard, plus:</p>}
        <ul className={`${si ? 'mt-3' : 'mt-5'} space-y-3 text-[14px] text-slate-700`}>
          {(si ? SI_FEATURES : STANDARD_FEATURES).map((f) => (
            <Feature key={f} accent={si}>
              {f}
            </Feature>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-[14px]">
          {(['month', 'year'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setBilling(v)}
              className={`h-9 rounded-lg px-4 font-medium transition ${billing === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {v === 'month' ? 'Monthly' : 'Yearly'}
              {v === 'year' && <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">Save up to 50%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
        {card('standard')}
        {card('si')}
      </div>

      <div className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-3">
        <Assurance icon={<RefreshCcw size={16} />} title="Never renews by itself">
          Each payment covers one month or one year. We never charge you without your click.
        </Assurance>
        <Assurance icon={<ShieldCheck size={16} />} title="7-day refund">
          Not right for you? Ask within 7 days of your first payment for a full refund.
        </Assurance>
        <Assurance icon={<Lock size={15} />} title="Secure checkout">
          Paid in US dollars through Razorpay. Cards work worldwide.
        </Assurance>
      </div>

      <PlanGuide onPick={(tier, b) => void buy(planFor(tier, b))} busy={busy} />
    </div>
  )
}

/** "Which plan fits me?" — three situations, one plan each, so nobody has to compare feature lists. */
function PlanGuide({ onPick, busy }: { onPick: (tier: Tier, billing: Billing) => void; busy: PlanId | null }) {
  const rows: { situation: string; why: string; tier: Tier; billing: Billing }[] = [
    { situation: 'One important pitch or talk coming up', why: 'Rehearse and deliver it word-perfect.', tier: 'standard', billing: 'month' },
    { situation: 'Raising, selling or interviewing over the next months', why: 'Live answers when investors and clients push back.', tier: 'si', billing: 'year' },
    { situation: 'You present every week, all year', why: 'Unlimited presentations for less than a coffee a month.', tier: 'standard', billing: 'year' },
  ]
  return (
    <div className="mx-auto mt-12 max-w-4xl">
      <h3 className="text-center text-[18px] font-semibold tracking-tight">Which plan fits me?</h3>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {rows.map((r) => {
          const p = PLANS[planFor(r.tier, r.billing)]
          return (
            <button
              key={r.situation}
              type="button"
              disabled={!!busy}
              onClick={() => onPick(r.tier, r.billing)}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-orange-300 hover:shadow-sm disabled:opacity-60"
            >
              <span className="text-[14.5px] leading-snug font-semibold text-slate-900">{r.situation}</span>
              <span className="mt-1.5 flex-1 text-[13px] leading-snug text-slate-500">{r.why}</span>
              <span className="mt-4 flex items-center justify-between text-[13.5px] font-medium text-orange-700">
                <span>
                  {TIER_NAME[r.tier]} {r.billing === 'year' ? 'yearly' : 'monthly'} · {money(p.price)}
                </span>
                {busy === p.id ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Assurance({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3.5">
      <span className="mt-0.5 text-emerald-600">{icon}</span>
      <div>
        <div className="text-[13.5px] font-semibold text-slate-900">{title}</div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">{children}</p>
      </div>
    </div>
  )
}

function Feature({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <li className="flex gap-2.5">
      <Check size={17} className={`mt-0.5 shrink-0 ${accent ? 'text-orange-600' : 'text-emerald-600'}`} />
      <span>{children}</span>
    </li>
  )
}

const FAQ: [string, string][] = [
  [
    'Which plan should I choose?',
    'If you just need to deliver your own script without notes, Standard is all you need. If people will ask you questions — investors, clients, interviewers — choose SI: it hears the question and shows you a confident answer from your own material. Presenting more than a few times? Go yearly: it costs about half and has no limit on presentations.',
  ],
  [
    'How many presentations can I have?',
    `Standard monthly includes ${PRESENTATION_LIMIT.standard} presentations and SI monthly ${PRESENTATION_LIMIT.si}. Any yearly plan is unlimited. Slides, scripts, rehearsals and presenting time are never limited. Before you choose a plan you can already prepare up to ${PRESENTATION_LIMIT.none} presentations.`,
  ],
  [
    'Do I need my own AI key for SI?',
    'Yes — SI runs on your own AI account: Anthropic Claude, OpenAI, Google Gemini, Groq, OpenRouter or any OpenAI-compatible API. Paste the key once in Settings → SI (it takes about a minute). The key stays on your device, requests go straight to that provider, and they bill you at their own rates. We add no markup and no daily caps.',
  ],
  [
    'Do plans renew automatically?',
    'No. Each payment covers one month or one year, and we never charge you without you clicking Pay. Buy again before or after it ends to extend — the extra time is added on top of what you have left.',
  ],
  [
    'How does SI hear the questions?',
    'In Chrome or Edge, click the headphones and share the tab of your Meet, Zoom or Teams call with "Also share tab audio". The call is transcribed on your computer; only the question and your deck material are sent to the AI provider you connected.',
  ],
  [
    'What happens when my plan ends?',
    'Your presentations and scripts stay on your device. Presenting pauses until you buy again, and everything is exactly where you left it.',
  ],
  [
    'Which payment methods can I use?',
    'Payments are processed securely by Razorpay in US dollars. Debit and credit cards work worldwide; other methods are shown in the payment window when they are available for your card and country.',
  ],
  ['Can I get a refund?', 'Yes — ask within 7 days of your first payment and we refund it in full. See the refund policy for details.'],
]

export function PricingPage() {
  return (
    <SiteShell title="Pricing">
      <PageHeader eyebrow="Pricing" title="Less than a coffee a month. Never go blank again.">
        A pitch is usually lost on the question you couldn't answer, not on the slide. <b className="font-semibold text-slate-900">Standard</b> keeps
        your words in front of you; <b className="font-semibold text-slate-900">SI</b> also hands you the answer when they ask. Pay once — nothing
        renews by itself.
      </PageHeader>
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <PricingTable />
      </section>
      <section className="border-t border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-[28px] font-semibold tracking-[-0.02em]">Questions about plans</h2>
          <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
                  {q}
                  <span className="text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2.5 text-[14px] leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </SiteShell>
  )
}
