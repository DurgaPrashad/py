import { useEffect, useState } from 'react'
import { platform } from '../../platform'
import type { Slide } from '../../types'

/** URL for a stored slide image (resolved asynchronously in the browser). */
export function useAssetUrl(path: string | null | undefined): string {
  const [url, setUrl] = useState(() => (path ? (platform.assetUrl(path) ?? '') : ''))
  useEffect(() => {
    if (!path) return setUrl('')
    const now = platform.assetUrl(path)
    if (now) return setUrl(now)
    let live = true
    platform.resolveAssetUrl(path).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [path])
  return url
}

interface Props {
  slide: Slide
  aspectRatio: number
  /** Use the small thumbnail instead of the full render. */
  thumb?: boolean
  version?: number
  className?: string
  /** Fill the parent height instead of the width. */
  fit?: 'width' | 'contain'
}

/**
 * A slide render, or — for script-only slides — a typographic card built
 * from the slide text so every slide has a visual.
 */
export function SlideImage({ slide, aspectRatio, thumb, version, className = '', fit = 'width' }: Props) {
  const [failed, setFailed] = useState(false)
  const path = thumb ? slide.thumbnail : slide.image
  const resolved = useAssetUrl(path)
  const src = resolved && version ? `${resolved}${resolved.includes('?') ? '&' : '?'}v=${version}` : resolved
  const pending = !!path && !resolved
  const style = fit === 'width' ? { aspectRatio: String(aspectRatio) } : { aspectRatio: String(aspectRatio), maxHeight: '100%', maxWidth: '100%' }

  if (pending) return <div style={style} className={`bg-[#111114] ${className}`} />
  if (!src || failed) {
    // Only the slide's own text — never the speaking script, which may be
    // on an audience screen.
    const firstLine = slide.extractedText.split(/\n|(?<=[.!?])\s/)[0]?.trim()
    return (
      <div style={style} className={`@container overflow-hidden bg-gradient-to-br from-[#17171c] to-[#0d0d10] ${className}`}>
        <div className="flex h-full flex-col justify-center px-[8%] text-left">
          <div className="line-clamp-3 text-[clamp(8px,5cqw,48px)] leading-tight font-semibold tracking-tight text-white/85">
            {firstLine || (thumb ? `Slide ${slide.slideNumber}` : '')}
          </div>
        </div>
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={`Slide ${slide.slideNumber}`}
      draggable={false}
      onError={() => setFailed(true)}
      style={style}
      className={`block bg-white object-contain ${className}`}
    />
  )
}
