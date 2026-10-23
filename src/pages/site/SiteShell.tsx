import { ArrowRight, Cookie, Menu, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { PRODUCT } from '../../config'
import { useAccount } from '../../features/account/account'

const NAV = [
  { to: '/#product', label: 'Product' },
  { to: '/#copilot', label: 'SI copilot' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/docs', label: 'Docs' },
  { to: '/download', label: 'Download' },
]

/**
 * Layout of the public website (landing, pricing, legal, contact): a light,
 * scrollable page with the top navigation, footer and cookie notice.
 */
export function SiteShell({ children, title }: { children: ReactNode; title?: string }) {
  const scroller = useRef<HTMLDivElement>(null)
  const { pathname, hash } = useLocation()

  useEffect(() => {
    document.title = title ? `${title} · ${PRODUCT}` : `${PRODUCT} — the AI teleprompter for pitches and calls`
  }, [title])

  // Section links (/#copilot) scroll to the section; page changes start at the top.
  // On first load the jump is instant and waits a moment for fonts and layout.
  const lastTarget = useRef<string | null>(null)
  useEffect(() => {
    const target = pathname + hash
    // Smooth only when moving within the page (not on load, nor on a re-run for the same target).
    const smooth = lastTarget.current !== null && lastTarget.current !== target
    lastTarget.current = target
    const id = hash.slice(1)
    const el = id && /^[\w-]+$/.test(id) ? document.getElementById(id) : null
    if (!el) {
      scroller.current?.scrollTo({ top: 0 })
      return
    }
    if (smooth) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const t = setTimeout(() => el.scrollIntoView({ block: 'start' }), 120)
    return () => clearTimeout(t)
  }, [pathname, hash])

  return (
    <div ref={scroller} className="light selectable h-full overflow-y-auto bg-white text-slate-900 antialiased [color-scheme:light]">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
      <CookieNotice />
    </div>
  )
}

function SiteNav() {
  const session = useAccount((s) => s.session)
  const [open, setOpen] = useState(false)
  const { pathname, hash } = useLocation()
  useEffect(() => setOpen(false), [pathname, hash])

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-[15px] font-semibold tracking-tight">{PRODUCT}</span>
        </Link>
        <nav className="hidden items-center gap-7 text-[14px] text-slate-600 md:flex">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="hover:text-slate-900">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {session ? (
            <>
              <Link to="/account" className="px-3 text-[14px] text-slate-600 hover:text-slate-900">
                Account
              </Link>
              <PrimaryLink to="/app" small>
                Open app <ArrowRight size={15} />
              </PrimaryLink>
            </>
          ) : (
            <>
              <Link to="/login" className="px-3 text-[14px] font-medium text-slate-700 hover:text-slate-900">
                Sign in
              </Link>
              <PrimaryLink to="/signup" small>
                Start free trial
              </PrimaryLink>
            </>
          )}
        </div>
        <button type="button" className="rounded-lg p-2 text-slate-700 md:hidden" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <div className="border-t border-slate-200 bg-white px-4 pt-2 pb-4 md:hidden">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="block py-2.5 text-[15px] text-slate-700">
              {n.label}
            </Link>
          ))}
          <div className="mt-3 flex gap-2">
            {session ? (
              <PrimaryLink to="/app">Open app</PrimaryLink>
            ) : (
              <>
                <SecondaryLink to="/login">Sign in</SecondaryLink>
                <PrimaryLink to="/signup">Start free trial</PrimaryLink>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

function SiteFooter() {
  const col = (title: string, links: [string, string][]) => (
    <div>
      <div className="text-[13px] font-semibold text-slate-900">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map(([to, label]) => (
          <li key={to}>
            <NavLink to={to} className="text-[13.5px] text-slate-600 hover:text-slate-900">
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="text-[15px] font-semibold tracking-tight">{PRODUCT}</span>
          </Link>
          <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-slate-600">
            The teleprompter that follows your voice, with an AI copilot for the questions you didn't rehearse.
          </p>
        </div>
        {col('Product', [
          ['/app', 'Web app'],
          ['/download', 'Mac app'],
          ['/pricing', 'Pricing'],
          ['/docs', 'Docs'],
          ['/account', 'Your account'],
        ])}
        {col('Support', [
          ['/contact', 'Contact us'],
          ['/refunds', 'Refunds & cancellation'],
          ['/shipping', 'Shipping & delivery'],
        ])}
        {col('Legal', [
          ['/privacy', 'Privacy policy'],
          ['/terms', 'Terms & conditions'],
          ['/cookies', 'Cookie policy'],
        ])}
      </div>
      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-[12.5px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            © {new Date().getFullYear()} {PRODUCT}. All rights reserved.
          </span>
          <span>Payments are processed securely by Razorpay. Prices in USD.</span>
        </div>
      </div>
    </footer>
  )
}

const COOKIE_KEY = 'reflex.cookieNotice'

function readCookieChoice(): boolean {
  try {
    return localStorage.getItem(COOKIE_KEY) === 'ok'
  } catch {
    return false
  }
}

/** We only use essential storage, so this is a notice with a link, not a consent wall. */
function CookieNotice() {
  const [seen, setSeen] = useState(readCookieChoice)
  if (seen) return null
  const accept = () => {
    try {
      localStorage.setItem(COOKIE_KEY, 'ok')
    } catch {
      // storage blocked: the notice just shows again next time
    }
    setSeen(true)
  }
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 sm:right-auto sm:left-4 sm:max-w-[420px]">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.16)]">
        <div className="flex items-start gap-3">
          <Cookie size={18} className="mt-0.5 shrink-0 text-orange-600" />
          <p className="text-[13px] leading-relaxed text-slate-600">
            We use only essential cookies and local storage — to keep you signed in, process payments and save your work. No advertising or tracking
            cookies. <Link to="/cookies" className="font-medium text-slate-900 underline underline-offset-2">Cookie policy</Link>
          </p>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={accept} className="h-8 rounded-lg bg-slate-900 px-4 text-[13px] font-medium text-white hover:bg-slate-800">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export function PrimaryLink({ to, children, small }: { to: string; children: ReactNode; small?: boolean }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 font-medium text-white shadow-sm shadow-orange-600/20 transition hover:bg-orange-700 ${
        small ? 'h-9 px-4 text-[14px]' : 'h-12 px-6 text-[15px]'
      }`}
    >
      {children}
    </Link>
  )
}

export function SecondaryLink({ to, children, small }: { to: string; children: ReactNode; small?: boolean }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 ${
        small ? 'h-9 px-4 text-[14px]' : 'h-12 px-6 text-[15px]'
      }`}
    >
      {children}
    </Link>
  )
}

/** Centered page heading used by pricing, legal and contact pages. */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="border-b border-slate-200 bg-gradient-to-b from-orange-50/60 to-white">
      <div className="mx-auto max-w-3xl px-4 pt-16 pb-12 text-center sm:px-6">
        {eyebrow && <p className="text-[12.5px] font-semibold tracking-[0.16em] text-orange-600 uppercase">{eyebrow}</p>}
        <h1 className="mt-3 text-[34px] leading-tight font-semibold tracking-[-0.03em] sm:text-[44px]">{title}</h1>
        {children && <div className="mx-auto mt-4 max-w-2xl text-[16px] leading-relaxed text-slate-600">{children}</div>}
      </div>
    </div>
  )
}
