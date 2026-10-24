import { ArrowLeft, CheckCircle2, Loader2, LogOut, Receipt, Sparkles } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { toast } from '../../components/Toast'
import { PLANS, PRODUCT, SITE_URL, TIER_NAME, type PlanId } from '../../config'
import { daysLeft, entitlements, useAccount, type Payment } from '../../features/account/account'
import { syncPayments } from '../../features/account/checkout'
import { platform } from '../../platform'
import { supabase } from '../../services/supabase'
import { HOME } from '../../utils/routes'
import { useBuyPlan } from './Pricing'

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export function AccountPage() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const ready = useAccount((s) => s.ready)
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const setProfile = useAccount((s) => s.setProfile)
  const refresh = useAccount((s) => s.refresh)
  const signOut = useAccount((s) => s.signOut)
  const { buy, busy } = useBuyPlan()
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [name, setName] = useState('')
  const highlight = search.get('plan') as PlanId | null
  const ent = entitlements(profile)

  useEffect(() => {
    document.title = `Account · ${PRODUCT}`
  }, [])
  useEffect(() => setName(profile?.full_name ?? ''), [profile?.full_name])

  // Apply any payment whose confirmation was missed, then load the history.
  const paid = search.get('paid')
  useEffect(() => {
    if (!session) return
    let live = true
    ;(async () => {
      try {
        const p = await syncPayments()
        if (live && p) setProfile(p)
      } catch {
        await refresh().catch(() => null)
      }
      const { data } = await supabase.from('payments').select('*').eq('status', 'paid').order('created_at', { ascending: false })
      if (live) setPayments((data as Payment[]) ?? [])
    })()
    return () => {
      live = false
    }
  }, [session, paid, setProfile, refresh])

  if (ready && !session) return <Navigate to={`/login?next=${encodeURIComponent('/account' + (highlight ? `?plan=${highlight}` : ''))}`} replace />

  const saveName = async () => {
    if (!profile || name.trim() === (profile.full_name ?? '')) return
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() || null }).eq('id', profile.id)
    if (error) toast(error.message, 'error')
    else {
      await refresh()
      toast('Name updated', 'success')
    }
  }

  const status = !profile ? null : ent.si ? (
    <>
      <b>SI</b> is active until <b>{fmtDate(profile.si_until)}</b> ({daysLeft(profile.si_until)} days left).
    </>
  ) : ent.standard ? (
    <>
      <b>Standard</b> is active until <b>{fmtDate(profile.standard_until)}</b> ({daysLeft(profile.standard_until)} days left).
    </>
  ) : (
    <>No plan yet. Choose Standard or SI below — you can start as soon as the payment goes through.</>
  )

  return (
    <div className="light selectable h-full overflow-y-auto bg-slate-50 text-slate-900 [color-scheme:light]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link to={platform.kind === 'web' ? '/' : HOME} className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-[15px] font-semibold tracking-tight">{PRODUCT}</span>
          </Link>
          <Link to={HOME} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-[14px] font-medium text-white hover:bg-slate-800">
            <ArrowLeft size={15} /> Back to presentations
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.025em]">Your account</h1>
            <p className="mt-1 text-[14.5px] text-slate-500">{profile?.email ?? session?.user.email}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut()
              navigate(platform.kind === 'web' ? '/' : '/login', { replace: true })
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-[14px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>

        {search.get('paid') && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-[14.5px] text-emerald-900">
            <CheckCircle2 size={20} className="shrink-0 text-emerald-600" /> Payment received — thank you! Your plan is active now.
          </div>
        )}

        <Card title="Plan">
          {!profile ? (
            <Loader2 size={18} className="animate-spin text-slate-400" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                    ent.si ? 'bg-orange-100 text-orange-800' : ent.standard ? 'bg-slate-900 text-white' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {ent.planName}
                </span>
                <p className="text-[14.5px] text-slate-700 [&_b]:font-semibold [&_b]:text-slate-900">{status}</p>
              </div>
              {ent.si && ent.standard && profile.standard_until && Date.parse(profile.standard_until) > Date.parse(profile.si_until ?? '') && (
                <p className="mt-2 text-[13.5px] text-slate-500">Standard continues after SI ends, until {fmtDate(profile.standard_until)}.</p>
              )}
              <p className="mt-3 text-[13.5px] text-slate-500">
                {ent.si ? 'SI copilot answers: up to 300 a day with the built-in AI.' : 'AI answers on calls come with the SI plan.'}
              </p>
            </>
          )}
        </Card>

        <Card title={ent.si || ent.standard ? 'Extend or change your plan' : 'Choose a plan'}>
          {platform.kind === 'desktop' ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-md text-[14.5px] text-slate-600">
                Plans are bought on the website with this same account ({profile?.email ?? session?.user.email}). Pay there and the plan applies here
                automatically.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void refresh().catch(() => null)}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-[14px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void platform.openExternal(`${SITE_URL}/account`).catch(() => null)}
                  className="h-10 rounded-xl bg-orange-600 px-4 text-[14px] font-medium text-white hover:bg-orange-700"
                >
                  Choose a plan in your browser
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {(['standard', 'si'] as const).map((tier) => (
                <div key={tier} className={`rounded-2xl border p-5 ${tier === 'si' ? 'border-orange-300 bg-orange-50/40' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center gap-2">
                    {tier === 'si' && <Sparkles size={15} className="text-orange-600" />}
                    <h3 className="text-[16px] font-semibold">{TIER_NAME[tier]}</h3>
                    <span className="text-[12.5px] text-slate-500">{tier === 'si' ? 'with AI copilot' : 'non-SI · unlimited usage'}</span>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    {(['monthly', 'yearly'] as const).map((period) => {
                      const id = `${tier}_${period}` as PlanId
                      const plan = PLANS[id]
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={!!busy}
                          onClick={() => void buy(id)}
                          className={`flex h-11 items-center justify-between rounded-xl border px-4 text-[14.5px] font-medium transition disabled:opacity-60 ${
                            highlight === id
                              ? 'border-orange-500 bg-orange-600 text-white hover:bg-orange-700'
                              : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {busy === id && <Loader2 size={15} className="animate-spin" />}1 {plan.interval}
                          </span>
                          <span>${plan.price}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-[12.5px] text-slate-500">
            Prepaid, no automatic renewal. Extra time is added on top of what you have left. <Link to="/pricing" className="underline">Compare plans</Link> ·{' '}
            <Link to="/refunds" className="underline">Refund policy</Link>
          </p>
        </Card>

        <Card title="Profile">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[240px] flex-1">
              <span className="mb-1.5 block text-[13.5px] font-medium text-slate-700">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15"
              />
            </label>
            <Link to="/forgot" className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-[14px] leading-[2.75rem] font-medium text-slate-700 hover:bg-slate-50">
              Change password
            </Link>
          </div>
          <p className="mt-3 text-[12.5px] text-slate-500">
            Member since {fmtDate(profile?.created_at ?? null)}. To delete your account, <Link to="/contact?topic=privacy" className="underline">contact us</Link>.
          </p>
        </Card>

        <Card title="Payments">
          {payments === null ? (
            <Loader2 size={18} className="animate-spin text-slate-400" />
          ) : payments.length === 0 ? (
            <p className="flex items-center gap-2 text-[14px] text-slate-500">
              <Receipt size={16} /> No payments yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead className="text-[12.5px] text-slate-500">
                  <tr>
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 font-medium">Period</th>
                    <th className="pb-2 font-medium">Amount</th>
                    <th className="pb-2 font-medium">Payment ID</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-2.5 pr-4">{fmtDate(p.paid_at)}</td>
                      <td className="py-2.5 pr-4">
                        {TIER_NAME[p.plan.startsWith('si') ? 'si' : 'standard']} · {p.plan.endsWith('yearly') ? '1 year' : '1 month'}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
                      </td>
                      <td className="py-2.5 pr-4">
                        {(p.amount / 100).toLocaleString(undefined, { style: 'currency', currency: p.currency })}
                      </td>
                      <td className="py-2.5 font-mono text-[12.5px] text-slate-500">{p.razorpay_payment_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-[13px] font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
      {children}
    </section>
  )
}
