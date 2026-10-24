import { Check, Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../../components/Toast'
import { AI_DAILY_LIMIT, PLANS, planFor, SITE_URL, type PlanId, type Tier } from '../../config'
import { entitlements, useAccount } from '../../features/account/account'
import { checkout } from '../../features/account/checkout'
import { platform } from '../../platform'
import { errorMessage } from '../../services/tauri'
import { PageHeader, SiteShell } from './SiteShell'

type Interval = 'month' | 'year'

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

const STANDARD_FEATURES = [
  'Unlimited presentations and presenting time',
  'Paste or write your own script for every slide',
  'Teleprompter that follows your voice, word by word',
  'Private on-device speech recognition',
  'Present on Google Meet, Zoom & Teams — the audience sees only slides',
  'Second-display presenter console',
  'PDF & PowerPoint import with OCR',
  'Web app + Mac app',
]

const SI_FEATURES = [
  'Hears questions asked on the call and suggests an answer in seconds',
  'Answers grounded in your deck, scripts, Q&A prep notes and sources',
  'Add sources with the + button: text notes on any SI plan; upload PDFs and documents on SI yearly',
  'Type any question mid-call for an instant talking point',
  'AI drafts a speaking script for any slide',
  'Built-in AI, or plug in your own API key: Claude, OpenAI, Gemini, Groq, OpenRouter or any OpenAI-compatible API',
  `Up to ${AI_DAILY_LIMIT} answers a day with the built-in AI — no limit with your own key`,
]

export function PricingTable({ afterPaid }: { afterPaid?: string | null }) {
  const [interval, setBilling] = useState<Interval>('month')
  const { buy, busy } = useBuyPlan(afterPaid)
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)

  const price = (tier: Tier) => PLANS[planFor(tier, interval)].price
  const perMonth = (tier: Tier) => (interval === 'year' ? `$${(price(tier) / 12).toFixed(2).replace(/\.00$/, '')}/month billed yearly` : 'billed monthly')
  const saving = (tier: Tier) => Math.round((1 - PLANS[planFor(tier, 'year')].price / (PLANS[planFor(tier, 'month')].price * 12)) * 100)

  const button = (tier: Tier) => {
    const plan = planFor(tier, interval)
    const current = tier === 'si' ? ent.si : ent.standard && !ent.si
    return (
      <button
        type="button"
        disabled={!!busy}
        onClick={() => void buy(plan)}
        className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-medium transition disabled:opacity-60 ${
          tier === 'si' ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/25 hover:bg-orange-700' : 'bg-slate-900 text-white hover:bg-slate-800'
        }`}
      >
        {busy === plan && <Loader2 size={16} className="animate-spin" />}
        {current ? `Extend ${tier === 'si' ? 'SI' : 'Standard'} · $${price(tier)}` : `Get ${tier === 'si' ? 'SI' : 'Standard'} · $${price(tier)}`}
      </button>
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
              className={`h-9 rounded-lg px-4 font-medium transition ${interval === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {v === 'month' ? 'Monthly' : 'Yearly'}
              {v === 'year' && <span className="ml-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700">Save up to 50%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
        {/* Standard (non-SI) */}
        <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-7">
          <div className="flex items-center justify-between">
            <h3 className="text-[17px] font-semibold">Standard</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600">Non-SI</span>
          </div>
          <p className="mt-1 text-[13.5px] text-slate-500">Your own script, perfectly paced — unlimited.</p>
          <div className="mt-6 flex items-baseline gap-1.5">
            <span className="text-[44px] leading-none font-semibold tracking-tight">${price('standard')}</span>
            <span className="text-[14px] text-slate-500">/ {interval}</span>
          </div>
          <p className="mt-2 h-5 text-[13px] text-slate-500">
            {perMonth('standard')}
            {interval === 'year' && <span className="ml-1.5 font-medium text-emerald-700">save {saving('standard')}%</span>}
          </p>
          {button('standard')}
          <div className="mt-5 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] font-medium text-emerald-800">
            {interval === 'year' ? 'Full year · unlimited usage' : 'Unlimited usage, all month'}
          </div>
          <ul className="mt-5 space-y-3 text-[14px] text-slate-700">
            {STANDARD_FEATURES.map((f) => (
              <Feature key={f}>{f}</Feature>
            ))}
          </ul>
        </div>

        {/* SI */}
        <div className="relative flex flex-col rounded-3xl border-2 border-orange-500 bg-white p-7 shadow-[0_20px_60px_rgba(232,101,15,0.14)]">
          <span className="absolute -top-3.5 left-7 inline-flex items-center gap-1 rounded-full bg-orange-600 px-3 py-1 text-[12px] font-semibold text-white">
            <Sparkles size={12} /> Most popular
          </span>
          <div className="flex items-center justify-between">
            <h3 className="text-[17px] font-semibold">SI</h3>
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11.5px] font-semibold text-orange-700">Super Intelligence</span>
          </div>
          <p className="mt-1 text-[13.5px] text-slate-500">Standard + an AI copilot for live Q&A.</p>
          <div className="mt-6 flex items-baseline gap-1.5">
            <span className="text-[44px] leading-none font-semibold tracking-tight">${price('si')}</span>
            <span className="text-[14px] text-slate-500">/ {interval}</span>
          </div>
          <p className="mt-2 h-5 text-[13px] text-slate-500">
            {perMonth('si')}
            {interval === 'year' && <span className="ml-1.5 font-medium text-emerald-700">save {saving('si')}%</span>}
          </p>
          {button('si')}
          <p className="mt-5 text-[13px] font-semibold text-slate-900">Everything in Standard, plus:</p>
          <ul className="mt-3 space-y-3 text-[14px] text-slate-700">
            {SI_FEATURES.map((f) => (
              <Feature key={f} accent>
                {f}
              </Feature>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-8 text-center text-[13px] leading-relaxed text-slate-500">
        Prices in US dollars. Each plan is prepaid for a month or a year and does not renew automatically — buy again any time to extend it.
        <br className="hidden sm:block" /> Secure payments by Razorpay. 7-day refund on your first payment.
      </p>
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
    'What is the difference between Standard and SI?',
    'Standard (non-SI) is the full teleprompter for your own script: paste or write what you want to say, and the strip under your camera follows your voice. It has no usage limits. SI adds Super Intelligence: an AI copilot that hears the questions people ask on your call and suggests an answer built from your deck and notes.',
  ],
  [
    'Is Standard really unlimited?',
    'Yes. Standard has no limits on presentations, slides, scripts or presenting time, for the whole month or the whole year you buy.',
  ],
  [
    'Do plans renew automatically?',
    'No. Each payment covers one month or one year. We never charge you without you clicking Pay. Buy again before or after it ends to extend — extra time is added on top of what you have left.',
  ],
  [
    'How does SI hear the questions?',
    'In Chrome or Edge, click "Listen to the call" and share the tab of your Meet, Zoom or Teams call with "Also share tab audio" ticked. The call audio is transcribed on your computer; only a detected question and your deck notes are sent to our AI provider to write the answer.',
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
      <PageHeader eyebrow="Pricing" title="Simple plans for every presenter">
        Choose <b className="font-semibold text-slate-900">Standard</b> for unlimited teleprompting with your own script, or{' '}
        <b className="font-semibold text-slate-900">SI</b> when you want AI help with live questions. Pay once for a month or a year.
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
