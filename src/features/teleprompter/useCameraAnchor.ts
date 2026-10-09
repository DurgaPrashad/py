import { useEffect, useState } from 'react'
import { platform, type CameraAnchor } from '../../platform'

export type { CameraAnchor }

const fallback = (): CameraAnchor => ({ centerX: window.innerWidth / 2, top: 0 })

/**
 * Tracks where the camera is relative to this window so the teleprompter
 * can sit directly beneath it (keeps the presenter's eyes near the lens).
 */
export function useCameraAnchor(enabled: boolean): CameraAnchor {
  const [anchor, setAnchor] = useState<CameraAnchor>(fallback)

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let live = true
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        platform.windows
          .cameraAnchor()
          .then((a) => live && setAnchor(a))
          .catch(() => live && setAnchor(fallback()))
      }, 60)
    }
    refresh()
    // Fullscreen transitions settle a little after the resize event.
    const late = setTimeout(refresh, 700)
    window.addEventListener('resize', refresh)
    const unmove = platform.windows.onMoved(refresh)
    return () => {
      live = false
      clearTimeout(timer)
      clearTimeout(late)
      window.removeEventListener('resize', refresh)
      unmove()
    }
  }, [enabled])

  return anchor
}
