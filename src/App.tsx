import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from './components/Toast'
import { useAccount } from './features/account/account'
import { RequireAccount, RequirePlan } from './features/account/guards'
import { applyTheme, useSettings } from './features/settings/settingsStore'
import { AudiencePage } from './pages/AudiencePage'
import { platform } from './platform'
import { HomePage } from './pages/HomePage'
import { PresentPage } from './pages/PresentPage'
import { HOME } from './utils/routes'

// Import / editing pull in pdf.js, Tesseract and the PPTX parser; load them
// on demand so launching and presenting stay light. The website pages too.
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })))
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })))
const PricingPage = lazy(() => import('./pages/site/Pricing').then((m) => ({ default: m.PricingPage })))
const AuthPage = lazy(() => import('./pages/site/AuthPage').then((m) => ({ default: m.AuthPage })))
const AccountPage = lazy(() => import('./pages/site/AccountPage').then((m) => ({ default: m.AccountPage })))
const ContactPage = lazy(() => import('./pages/site/ContactPage').then((m) => ({ default: m.ContactPage })))
const DocsPage = lazy(() => import('./pages/site/DocsPage').then((m) => ({ default: m.DocsPage })))
const DownloadPage = lazy(() => import('./pages/site/DownloadPage').then((m) => ({ default: m.DownloadPage })))
const legal = (name: 'PrivacyPage' | 'TermsPage' | 'RefundPage' | 'ShippingPage' | 'CookiesPage') =>
  lazy(() => import('./pages/site/LegalPages').then((m) => ({ default: m[name] })))
const PrivacyPage = legal('PrivacyPage')
const TermsPage = legal('TermsPage')
const RefundPage = legal('RefundPage')
const ShippingPage = legal('ShippingPage')
const CookiesPage = legal('CookiesPage')

const web = platform.kind === 'web'

// The website has real paths (needed for shareable policy and pricing URLs);
// the desktop app loads from its bundle and keeps hash routes.
function Router({ children }: { children: ReactNode }) {
  return web ? <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>{children}</BrowserRouter> : <HashRouter>{children}</HashRouter>
}

const app = (page: ReactNode) => <RequireAccount>{page}</RequireAccount>
/** Signed in with a paid plan; otherwise the plan picker (pay, then the page opens). */
const paid = (page: ReactNode) => app(<RequirePlan>{page}</RequirePlan>)

export function App() {
  const load = useSettings((s) => s.load)
  const loaded = useSettings((s) => s.loaded)
  const theme = useSettings((s) => s.settings.theme)

  useEffect(() => {
    load()
    useAccount.getState().init()
  }, [load])

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  if (!loaded) return <div className="h-full bg-app" />

  return (
    <Router>
      <Suspense fallback={<div className="h-full bg-app" />}>
        <Routes>
          {web && (
            <>
              <Route path="/" element={<LandingPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/download" element={<DownloadPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/refunds" element={<RefundPage />} />
              <Route path="/shipping" element={<ShippingPage />} />
              <Route path="/cookies" element={<CookiesPage />} />
            </>
          )}
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/signup" element={<AuthPage mode="signup" />} />
          <Route path="/forgot" element={<AuthPage mode="forgot" />} />
          <Route path="/reset" element={<AuthPage mode="reset" />} />
          <Route path="/account" element={<AccountPage />} />

          {/* Everything is open to explore; presenting needs a plan. */}
          <Route path={HOME} element={app(<HomePage />)} />
          <Route path="/import" element={app(<ImportPage />)} />
          <Route path="/edit/:id" element={app(<EditorPage />)} />
          <Route path="/present/:id" element={paid(<PresentPage />)} />
          <Route path="/audience/:id" element={<AudiencePage />} />
          <Route path="/settings" element={app(<SettingsPage />)} />
          <Route path="*" element={<Navigate to={HOME} replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </Router>
  )
}
