import { ArrowLeft, Check, Loader2, Mic, MonitorUp, Sparkles } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { FREE_AI_ANSWERS, PRODUCT, SITE_URL, TRIAL_DAYS } from '../../config'
import { useAccount } from '../../features/account/account'
import { platform } from '../../platform'
import { supabase } from '../../services/supabase'
import { errorMessage } from '../../services/tauri'
import { HOME } from '../../utils/routes'

type Mode = 'login' | 'signup' | 'forgot' | 'reset'

const TITLES: Record<Mode, [string, string]> = {
  login: ['Welcome back', 'Sign in to your presentations and plan.'],
  signup: ['Create your account', `Free for ${TRIAL_DAYS} days. No card needed.`],
  forgot: ['Reset your password', 'We’ll email you a link to choose a new one.'],
  reset: ['Choose a new password', 'Enter it twice and you’re back in.'],
}

/** Where to go after signing in: ?next=… (same-site paths only), else the app. */
function nextPath(search: URLSearchParams): string {
  const plan = search.get('plan')
  if (plan) return `/account?plan=${encodeURIComponent(plan)}`
  const next = search.get('next')
  return next && next.startsWith('/') && !next.startsWith('//') ? next : HOME
}

export function AuthPage({ mode }: { mode: Mode }) {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const session = useAccount((s) => s.session)
  const signIn = useAccount((s) => s.signIn)
  const signUp = useAccount((s) => s.signUp)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    document.title = `${TITLES[mode][0]} · ${PRODUCT}`
    setError('')
    setNotice('')
  }, [mode])

  // Already signed in: skip the form (but stay on the reset page — that session is for it).
  useEffect(() => {
    if (session && (mode === 'login' || mode === 'signup')) navigate(nextPath(search), { replace: true })
  }, [session, mode, navigate, search])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'login') await signIn(email, password)
      else if (mode === 'signup') await signUp(email, password, name)
      else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${SITE_URL}/reset` })
        if (error) throw new Error(`${error.message}. If this keeps happening, contact us and we'll reset it for you.`)
        setNotice('If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.')
      } else {
        if (password !== password2) throw new Error('The passwords don’t match.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw new Error(error.message)
        navigate(HOME, { replace: true })
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const [title, subtitle] = TITLES[mode]

  return (
    <div className="light selectable flex h-full overflow-y-auto bg-white text-slate-900 [color-scheme:light]">
      <div className="flex min-h-full flex-1 flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to={platform.kind === 'web' ? '/' : HOME} className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-[15px] font-semibold tracking-tight">{PRODUCT}</span>
          </Link>
          {platform.kind === 'web' && (
            <Link to="/" className="inline-flex items-center gap-1.5 text-[13.5px] text-slate-500 hover:text-slate-900">
              <ArrowLeft size={14} /> Back to site
            </Link>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <form onSubmit={submit} className="w-full max-w-[400px]">
            <h1 className="text-[28px] font-semibold tracking-[-0.025em]">{title}</h1>
            <p className="mt-1.5 text-[14.5px] text-slate-500">{subtitle}</p>

            <div className="mt-7 space-y-4">
              {mode === 'signup' && (
                <Field label="Full name">
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ada Lovelace" className={INPUT} />
                </Field>
              )}
              {mode !== 'reset' && (
                <Field label="Work email">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@company.com"
                    className={INPUT}
                    autoFocus
                  />
                </Field>
              )}
              {mode !== 'forgot' && (
                <Field
                  label={mode === 'reset' ? 'New password' : 'Password'}
                  aside={
                    mode === 'login' && (
                      <Link to="/forgot" className="text-[13px] font-medium text-orange-700 hover:underline">
                        Forgot password?
                      </Link>
                    )
                  }
                >
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'login' ? '••••••••' : 'At least 6 characters'}
                    className={INPUT}
                  />
                </Field>
              )}
              {mode === 'reset' && (
                <Field label="Repeat new password">
                  <input type="password" required minLength={6} value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" className={INPUT} />
                </Field>
              )}
            </div>

            {error && <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13.5px] text-red-700">{error}</p>}
            {notice && <p className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13.5px] text-emerald-800">{notice}</p>}

            <button
              type="submit"
              disabled={busy || (mode === 'reset' && !session)}
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 text-[15px] font-medium text-white shadow-sm shadow-orange-600/20 transition hover:bg-orange-700 disabled:opacity-60"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Save new password'}
            </button>
            {mode === 'reset' && !session && (
              <p className="mt-3 text-[13px] text-slate-500">Open this page from the link in your reset email.</p>
            )}

            {mode === 'signup' && (
              <p className="mt-4 text-[12.5px] leading-relaxed text-slate-500">
                By creating an account you agree to the <Link to="/terms" className="underline">Terms</Link> and{' '}
                <Link to="/privacy" className="underline">Privacy policy</Link>.
              </p>
            )}

            <p className="mt-7 text-center text-[14px] text-slate-600">
              {mode === 'login' ? (
                <>
                  New to {PRODUCT}?{' '}
                  <Link to={`/signup${search.toString() ? `?${search}` : ''}`} className="font-medium text-orange-700 hover:underline">
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  {mode === 'signup' ? 'Already have an account?' : 'Remembered it?'}{' '}
                  <Link to={`/login${search.toString() ? `?${search}` : ''}`} className="font-medium text-orange-700 hover:underline">
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </form>
        </div>
      </div>

      <aside className="dark relative hidden w-[44%] max-w-[620px] overflow-hidden bg-[#0b0b0e] p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="pointer-events-none absolute -top-32 -right-32 h-[420px] w-[420px] rounded-full bg-orange-500/20 blur-3xl" />
        <p className="text-[12.5px] font-semibold tracking-[0.16em] text-orange-400 uppercase">For founders & presenters</p>
        <h2 className="mt-4 text-[34px] leading-[1.1] font-semibold tracking-[-0.03em]">Walk into every pitch knowing exactly what to say.</h2>
        <ul className="mt-8 space-y-4 text-[15px] text-white/75">
          <Point icon={<Mic size={16} />}>Your script under the camera, following your voice</Point>
          <Point icon={<MonitorUp size={16} />}>Share only the slides on Meet, Zoom or Teams</Point>
          <Point icon={<Sparkles size={16} />}>SI suggests answers to the questions you didn’t rehearse</Point>
        </ul>
        <div className="mt-10 flex items-center gap-2 text-[13.5px] text-white/60">
          <Check size={15} className="text-emerald-400" /> {TRIAL_DAYS}-day free trial · {FREE_AI_ANSWERS} SI answers included
        </div>
      </aside>
    </div>
  )
}

const INPUT =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15'

function Field({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[13.5px] font-medium text-slate-700">
        {label}
        {aside}
      </span>
      {children}
    </label>
  )
}

function Point({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-orange-300">{icon}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  )
}
