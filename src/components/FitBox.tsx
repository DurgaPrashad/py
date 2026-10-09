import type { ReactNode } from 'react'

/** Largest box of the given aspect ratio that fits inside the parent. */
export function FitBox({ ratio, children, className = '' }: { ratio: number; children: ReactNode; className?: string }) {
  return (
    <div className={`relative flex h-full w-full min-w-0 items-center justify-center ${className}`} style={{ containerType: 'size' }}>
      <div style={{ width: `min(100cqw, calc(100cqh * ${ratio}))`, height: `min(100cqh, calc(100cqw / ${ratio}))` }}>{children}</div>
    </div>
  )
}
