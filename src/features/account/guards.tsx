import { ArrowLeft, Loader2, LogOut, RefreshCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { toast } from '../../components/Toast'
import { PRODUCT } from '../../config'
import { PricingTable } from '../../pages/site/Pricing'
import { platform } from '../../platform'
import { errorMessage } from '../../services/tauri'
import { HOME } from '../../utils/routes'
import { entitlements, useAccount } from './account'
import { syncPayments } from './checkout'

/** The web app needs an account (the desktop app asks when you open a plan-only page). */
export function RequireAccount({ children }: { children: ReactNode }) {
  const ready = useAccount((s) => s.ready)
  const session = useAccount((s) => s.session)
  const { pathname, search } = useLocation()
  if (platform.kind !== 'web') return children
  if (!ready) return <div className="h-full bg-app" />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />
  return children
}

/** Using the app needs a paid plan (Standard or SI). Without one: choose and pay, right here. */
export function RequirePlan({ children }: { children: ReactNode }) {
  const ready = useAccount((s) => s.ready)
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const { pathname, search } = useLocation()
  // Desktop self-tests (REFLEX_SELFTEST_FILE) run without an account.
  if (platform.kind === 'desktop' && import.meta.env.DEV) return children
  if (!ready || (session && !profile)) {
    return (
      <div className="flex h-full items-center justify-center bg-app">
        <Loader2 size={20} className="animate-spin text-subtle" />
      </div>
    )
  }
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />
  if (entitlements(profile).canPresent) return children
  return <ChoosePlan />
}

function ChoosePlan() {
  const navigate = useNavigate()
  const profile = useAccount((s) => s.profile)
  const setProfile = useAccount((s) => s.setProfile)
  const signOut = useAccount((s) => s.signOut)
  const [checking, setChecking] = useState(false)

  const recheck = async () => {
    setChecking(true)
    try {
      const p = (await syncPayments()) ?? (await useAccount.getState().refresh())
      if (p) setProfile(p)
      if (!entitlements(p).canPresent) toast("No payment found yet. If you've just paid, give it a minute and try again.", 'info')
    } catch (e) {
      toast(errorMessage(e), 'error')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="light selectable h-full overflow-y-auto bg-slate-50 text-slate-900 [color-scheme:light]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-[15px] font-semibold tracking-tight">{PRODUCT}</span>
            <button
              type="button"
              onClick={() => navigate(HOME)}
              className="ml-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13.5px] text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft size={14} /> Dashboard
            </button>
          </div>
          <div className="flex items-center gap-3 text-[13.5px] text-slate-500">
            <span className="hidden sm:inline">{profile?.email}</span>
            <button
              type="button"
              onClick={async () => {
                await signOut()
                navigate(platform.kind === 'web' ? '/' : '/login', { replace: true })
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.025em] sm:text-[36px]">Choose a plan to start presenting</h1>
          <p className="mt-3 text-[15.5px] leading-relaxed text-slate-600">
            Your presentations and scripts are saved. Pick <b className="font-semibold text-slate-900">Standard</b> to present with your own script, or{' '}
            <b className="font-semibold text-slate-900">SI</b> for the AI copilot too. This page opens the moment the payment goes through.
          </p>
        </div>
        <div className="mt-4">
          {/* Stay here after paying: the app opens as soon as the plan is active. */}
          <PricingTable afterPaid={null} />
        </div>
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={recheck}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Already paid? Check again
          </button>
        </div>
      </main>
    </div>
  )
}
