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
    // Dev only: `?devAudio=/path/to.wav` replays a 16 kHz WAV instead of the mic;
    // `?devCallAudio=` does the same for the call audio the SI copilot listens to.
    const params = new URLSearchParams(location.search)
    const devAudio = params.get('devAudio')
    if (devAudio) sessionStorage.setItem('reflex.devAudio', devAudio)
    const devCallAudio = params.get('devCallAudio')
    if (devCallAudio) sessionStorage.setItem('reflex.devCallAudio', devCallAudio)
  }
}

// Links from before the website used real paths (/#/app) still work.
if (!isTauri() && location.hash.startsWith('#/')) {
  history.replaceState(null, '', import.meta.env.BASE_URL.replace(/\/$/, '') + location.hash.slice(1))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
