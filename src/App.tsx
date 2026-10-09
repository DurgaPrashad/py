import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from './components/Toast'
import { applyTheme, useSettings } from './features/settings/settingsStore'
import { AudiencePage } from './pages/AudiencePage'
import { HomePage } from './pages/HomePage'
import { PresentPage } from './pages/PresentPage'

// Import / editing pull in pdf.js, Tesseract and the PPTX parser; load them
// on demand so launching and presenting stay light.
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })))
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

export function App() {
  const load = useSettings((s) => s.load)
  const loaded = useSettings((s) => s.loaded)
  const theme = useSettings((s) => s.settings.theme)

  useEffect(() => {
    load()
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
    <HashRouter>
      <Suspense fallback={<div className="h-full bg-app" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/edit/:id" element={<EditorPage />} />
          <Route path="/present/:id" element={<PresentPage />} />
          <Route path="/audience/:id" element={<AudiencePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </HashRouter>
  )
}
