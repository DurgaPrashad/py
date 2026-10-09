import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { isTauri } from './services/tauri'
import './index.css'

if (import.meta.env.DEV) {
  if (isTauri()) {
    ;(await import('./dev/forwardErrors')).forwardErrors()
    void (await import('./dev/selfTest')).runSelfTest()
  } else {
    // Dev only: `?devAudio=/path/to.wav` replays a 16 kHz WAV instead of the mic.
    const devAudio = new URLSearchParams(location.search).get('devAudio')
    if (devAudio) sessionStorage.setItem('reflex.devAudio', devAudio)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
