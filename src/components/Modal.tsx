import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  width?: number
}

export function Modal({ open, title, onClose, children, footer, width = 420 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    ref.current?.querySelector<HTMLElement>('input, textarea, button[data-autofocus]')?.focus()
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px] animate-fade-in" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="max-w-full rounded-2xl border border-line-strong bg-elevated shadow-2xl shadow-black/40 animate-rise"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-1 text-[15px] font-semibold tracking-tight">{title}</div>
        {children && <div className="px-5 py-3 text-[13px] text-muted">{children}</div>}
        {footer && <div className="flex justify-end gap-2 px-5 pt-2 pb-5">{footer}</div>}
      </div>
    </div>
  )
}
