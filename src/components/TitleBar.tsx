import type { ReactNode } from 'react'

/**
 * Window title bar. With the macOS overlay title bar the traffic lights sit
 * on top of the left padding; the bar itself drags the window.
 */
export function TitleBar({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <header
      data-tauri-drag-region
      className="relative z-20 flex h-[52px] shrink-0 items-center gap-3 border-b border-line bg-app/80 pr-3 pl-[84px] backdrop-blur"
    >
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-2">
        {left}
      </div>
      {center && (
        <div data-tauri-drag-region className="pointer-events-none absolute inset-x-0 flex justify-center">
          <div className="pointer-events-auto">{center}</div>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1.5">{right}</div>
    </header>
  )
}
