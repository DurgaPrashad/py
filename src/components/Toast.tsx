import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { create } from 'zustand'

type Tone = 'info' | 'success' | 'error'

interface ToastItem {
  id: number
  tone: Tone
  message: string
}

interface ToastState {
  items: ToastItem[]
  push: (message: string, tone?: Tone) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set) => ({
  items: [],
  push(message, tone = 'info') {
    const id = nextId++
    set((s) => ({ items: [...s.items, { id, tone, message }] }))
    setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), tone === 'error' ? 6000 : 3200)
  },
}))

export const toast = (message: string, tone?: Tone) => useToasts.getState().push(message, tone)

export function Toaster() {
  const items = useToasts((s) => s.items)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[360px] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line-strong bg-elevated px-3.5 py-3 text-[13px] shadow-xl shadow-black/30 animate-rise"
        >
          {t.tone === 'error' ? (
            <AlertCircle size={16} className="mt-px shrink-0 text-danger" />
          ) : t.tone === 'success' ? (
            <CheckCircle2 size={16} className="mt-px shrink-0 text-success" />
          ) : (
            <Info size={16} className="mt-px shrink-0 text-muted" />
          )}
          <span className="selectable leading-snug">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
