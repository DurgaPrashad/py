import { Check, Loader2, Lock, Sparkles } from 'lucide-react'
import { type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { PLANS, TRIAL_DAYS } from '../../config'
import { platform } from '../../platform'
import { HOME } from '../../utils/routes'
import { entitlements, useAccount } from './account'

/** The web app needs an account (the desktop app works signed out, except for paid features). */
export function RequireAccount({ children }: { children: ReactNode }) {
  const ready = useAccount((s) => s.ready)
  const session = useAccount((s) => s.session)
  const { pathname, search } = useLocation()
  if (platform.kind !== 'web') return children
  if (!ready) return <div className="h-full bg-app" />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />
  return children
}

/** Presenting needs a plan or the free trial. */
export function RequirePlan({ children }: { children: ReactNode }) {
  const ready = useAccount((s) => s.ready)
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const { pathname, search } = useLocation()
  // Desktop self-tests (REFLEX_SELFTEST_FILE) present without an account.
  if (platform.kind === 'desktop' && import.meta.env.DEV) return children
  if (!ready || (session && !profile)) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <Loader2 size={20} className="animate-spin text-white/40" />
      </div>
    )
  }
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />
  if (entitlements(profile).canPresent) return children
  return <Paywall />
}

function Paywall() {
  const navigate = useNavigate()
  return (
    <div className="dark flex h-full items-center justify-center overflow-y-auto bg-[#08080a] p-6 text-fg">
      <div className="w-[560px] max-w-full rounded-3xl border border-line-strong bg-elevated p-8 shadow-2xl animate-rise">
        <div className="flex items-center gap-3">
          <Logo size={30} />
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Lock size={15} />
          </span>
        </div>
        <h2 className="mt-5 text-[22px] font-semibold tracking-tight">Your {TRIAL_DAYS}-day free trial has ended</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          Your presentations and scripts are safe on this device. Pick a plan to keep presenting with the teleprompter that follows your voice.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-[14px] font-semibold">Standard · non-SI</div>
            <div className="mt-1 text-[13px] text-muted">
              ${PLANS.standard_monthly.price}/month or ${PLANS.standard_yearly.price}/year
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-success">
              <Check size={13} /> Unlimited usage
            </div>
          </div>
          <div className="rounded-2xl border border-accent/40 bg-accent-soft p-4">
            <div className="flex items-center gap-1.5 text-[14px] font-semibold">
              <Sparkles size={13} className="text-accent" /> SI
            </div>
            <div className="mt-1 text-[13px] text-muted">
              ${PLANS.si_monthly.price}/month or ${PLANS.si_yearly.price}/year
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-accent">
              <Check size={13} /> + AI answers on calls
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => navigate(HOME)} className="h-10 rounded-xl border border-line px-4 text-[14px] text-muted hover:bg-hover hover:text-fg">
            Back
          </button>
          <Link to="/account" className="inline-flex h-10 items-center rounded-xl bg-accent px-5 text-[14px] font-medium text-accent-fg hover:brightness-110">
            Choose a plan
          </Link>
        </div>
      </div>
    </div>
  )
}
