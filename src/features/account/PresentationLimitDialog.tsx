import { Infinity as InfinityIcon, Loader2, Sparkles } from 'lucide-react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { PLANS, type PlanId } from '../../config'
import { useBuyPlan } from '../../pages/site/Pricing'
import { entitlements, useAccount } from './account'

interface Upgrade {
  plan: PlanId
  title: string
  detail: string
  best?: boolean
}

const perMonth = (plan: PlanId) => `$${(PLANS[plan].price / 12).toFixed(2).replace(/\.00$/, '')}/month`

/**
 * Shown when a new presentation would go over the plan's limit: the upgrade
 * that removes the limit first, then the alternative.
 */
export function PresentationLimitDialog({ open, count, onClose }: { open: boolean; count: number; onClose: () => void }) {
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)
  const { buy, busy } = useBuyPlan(null)
  const limit = ent.presentationLimit
  const full = limit !== null && count >= limit

  const upgrades: Upgrade[] = ent.si
    ? [{ plan: 'si_yearly', title: `SI yearly · $${PLANS.si_yearly.price}`, detail: `Unlimited presentations, plus PDF & document sources · ${perMonth('si_yearly')}`, best: true }]
    : ent.standard
      ? [
          { plan: 'standard_yearly', title: `Standard yearly · $${PLANS.standard_yearly.price}`, detail: `Unlimited presentations · just ${perMonth('standard_yearly')}`, best: true },
          { plan: 'si_monthly', title: `SI monthly · $${PLANS.si_monthly.price}`, detail: '10 presentations, plus live AI answers on calls' },
        ]
      : [
          { plan: 'standard_yearly', title: `Standard yearly · $${PLANS.standard_yearly.price}`, detail: `Unlimited presentations · just ${perMonth('standard_yearly')}`, best: true },
          { plan: 'si_yearly', title: `SI yearly · $${PLANS.si_yearly.price}`, detail: 'Unlimited presentations, plus live AI answers on calls' },
        ]

  const choose = async (plan: PlanId) => {
    await buy(plan)
    const now = entitlements(useAccount.getState().profile).presentationLimit
    if (now === null || count < now) onClose()
  }

  return (
    <Modal
      open={open && limit !== null}
      width={460}
      title={
        ent.standard
          ? `Your ${ent.planName} plan includes ${limit} presentations`
          : full
            ? `You've set up ${count} presentations`
            : `Prepare up to ${limit} presentations, then choose a plan`
      }
      onClose={onClose}
      footer={<Button onClick={onClose}>Not now</Button>}
    >
      <p className="leading-relaxed">
        {ent.standard
          ? full
            ? `You have ${count}. Go yearly and never count again — or delete one you no longer need.`
            : `You're using ${count}. Go yearly and never count again.`
          : full
            ? 'That is as many as you can prepare before choosing a plan. Pick one to present them — any yearly plan has no limit.'
            : 'Any yearly plan has no limit — and presenting starts the moment you pay.'}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {upgrades.map((u) => (
          <button
            key={u.plan}
            type="button"
            disabled={!!busy}
            onClick={() => void choose(u.plan)}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-60 ${
              u.best ? 'border-accent/50 bg-accent-soft hover:border-accent' : 'border-line bg-surface hover:border-line-strong'
            }`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${u.best ? 'bg-accent text-accent-fg' : 'bg-hover text-muted'}`}>
              {busy === u.plan ? <Loader2 size={15} className="animate-spin" /> : PLANS[u.plan].interval === 'year' ? <InfinityIcon size={15} /> : <Sparkles size={15} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13.5px] font-medium text-fg">
                {u.title}
                {u.best && <span className="rounded-full bg-accent px-1.5 py-px text-[10.5px] font-semibold text-accent-fg">Best value</span>}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-muted">{u.detail}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-subtle">One-time payment · never renews automatically · 7-day refund on your first payment.</p>
    </Modal>
  )
}
