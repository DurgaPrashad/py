import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FitBox } from '../components/FitBox'
import { platform } from '../platform'
import { SlideImage } from '../features/slides/SlideImage'
import { loadPresentation } from '../services/storage/projects'
import type { Presentation } from '../types'

/**
 * Audience view for a second display: only the current slide, full screen,
 * following the presenter window.
 */
export function AudiencePage() {
  const { id = '' } = useParams()
  const [p, setP] = useState<Presentation | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    loadPresentation(id).then(setP).catch(() => setP(null))
  }, [id])

  useEffect(() => {
    document.title = 'Reflex — Slides'
    const off = platform.audience.onSlide(setIndex)
    // Give the listener a moment to register before asking for the slide.
    const t = setTimeout(() => platform.audience.ready(), 150)
    return () => {
      clearTimeout(t)
      off()
    }
  }, [])

  const slide = p?.slides[Math.min(index, (p?.slides.length ?? 1) - 1)]
  return (
    <div className="dark flex h-full items-center justify-center bg-black" data-tauri-drag-region>
      {p && slide && (
        <FitBox ratio={p.aspectRatio}>
          <div key={slide.id} className="h-full w-full animate-fade-in">
            <SlideImage slide={slide} aspectRatio={p.aspectRatio} className="h-full w-full" />
          </div>
        </FitBox>
      )}
    </div>
  )
}
