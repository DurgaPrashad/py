import { FileText, MonitorUp, MoreHorizontal, Pencil, Play, Plus, Presentation as PresentationIcon, Search, Settings2, Trash2, Upload } from 'lucide-react'
import { SourcesDialog } from '../features/copilot/SourcesDialog'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '../components/Button'
import { Logo } from '../components/Logo'
import { Modal } from '../components/Modal'
import { TitleBar } from '../components/TitleBar'
import { toast } from '../components/Toast'
import { PRODUCT, SITE_URL } from '../config'
import { AccountChip } from '../features/account/AccountChip'
import { useAccount } from '../features/account/account'
import { platform } from '../platform'
import { useFileDrop, useImportFlow } from '../features/presentation/useImport'
import { useSettings } from '../features/settings/settingsStore'
import { SlideImage } from '../features/slides/SlideImage'
import { createBlankPresentation } from '../services/parser/slides'
import {
  deletePresentation,
  estimateMs,
  listPresentations,
  presentationWordCount,
  savePresentation,
} from '../services/storage/projects'
import { errorMessage } from '../services/tauri'
import type { Presentation } from '../types'
import { formatDuration, formatRelative, plural } from '../utils/format'

export function HomePage() {
  const navigate = useNavigate()
  const { pick, start } = useImportFlow()
  const wpm = useSettings((s) => s.settings.wordsPerMinute)
  const [items, setItems] = useState<Presentation[] | null>(null)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<Presentation | null>(null)
  const [deleting, setDeleting] = useState<Presentation | null>(null)
  const [sourcesFor, setSourcesFor] = useState<Presentation | null>(null)

  const refresh = useCallback(async () => {
    try {
      setItems(await listPresentations())
    } catch (e) {
      toast(errorMessage(e), 'error')
      setItems([])
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    document.title = `Presentations · ${PRODUCT}`
  }, [])

  const dragging = useFileDrop((paths) => start(paths[0]))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!items || !q) return items ?? []
    return items.filter(
      (p) => p.name.toLowerCase().includes(q) || p.slides.some((s) => s.script.toLowerCase().includes(q) || s.extractedText.toLowerCase().includes(q)),
    )
  }, [items, query])

  const newPresentation = async () => {
    try {
      const p = await createBlankPresentation()
      navigate(`/edit/${p.id}`)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar
        left={
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[13.5px] font-semibold tracking-tight">Present</span>
          </div>
        }
        right={
          <>
            <AccountChip />
            <IconButton label="Settings" onClick={() => navigate('/settings')}>
              <Settings2 size={17} />
            </IconButton>
          </>
        }
      />

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[980px] px-8 pt-10 pb-16">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Presentations</h1>
              <p className="mt-1 text-[13.5px] text-muted">Your slides and speaking scripts stay on this device.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button icon={<Plus size={15} />} onClick={newPresentation}>
                New presentation
              </Button>
              <Button icon={<FileText size={15} />} onClick={() => pick('pdf')}>
                Import PDF
              </Button>
              <Button variant="primary" icon={<Upload size={15} />} onClick={() => pick('powerpoint')}>
                Import PowerPoint
              </Button>
            </div>
          </div>

          <DesktopSignInBanner />

          {items && items.length > 0 && (
            <div className="relative mt-8">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search presentations and scripts"
                className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13.5px] outline-none placeholder:text-subtle focus:border-accent/60"
              />
            </div>
          )}

          <div className="mt-4">
            {items === null ? null : items.length === 0 ? (
              <EmptyState onPick={() => pick('any')} />
            ) : filtered.length === 0 ? (
              <p className="py-16 text-center text-[13.5px] text-muted">No presentations match “{query}”.</p>
            ) : (
              <ul className="flex flex-col">
                {filtered.map((p) => (
                  <ProjectRow
                    key={p.id}
                    p={p}
                    wpm={wpm}
                    onOpen={() => navigate(`/edit/${p.id}`)}
                    onPresent={() => navigate(`/present/${p.id}`)}
                    onPresentCall={() => navigate(`/present/${p.id}?mode=share`)}
                    onRename={() => setRenaming(p)}
                    onDelete={() => setDeleting(p)}
                    onSources={() => setSourcesFor(p)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent/70 bg-app/85 backdrop-blur-sm animate-fade-in">
          <div className="text-center">
            <Upload size={28} className="mx-auto text-accent" />
            <p className="mt-3 text-[15px] font-medium">Drop to import</p>
            <p className="mt-1 text-[13px] text-muted">PDF, PPTX or PPT</p>
          </div>
        </div>
      )}

      <SourcesDialog
        presentation={sourcesFor}
        onClose={() => setSourcesFor(null)}
        onSave={async (next) => {
          const saved = await savePresentation(next)
          setSourcesFor(saved)
          refresh()
        }}
      />
      <RenameDialog
        item={renaming}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return
          await savePresentation({ ...renaming, name })
          setRenaming(null)
          refresh()
        }}
      />
      <Modal
        open={!!deleting}
        title={`Delete “${deleting?.name}”?`}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              data-autofocus
              onClick={async () => {
                if (!deleting) return
                try {
                  await deletePresentation(deleting.id)
                } catch (e) {
                  toast(errorMessage(e), 'error')
                }
                setDeleting(null)
                refresh()
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        The slides, scripts and imported file are removed from this computer. This cannot be undone.
      </Modal>
    </div>
  )
}

function ProjectRow({
  p,
  wpm,
  onOpen,
  onPresent,
  onPresentCall,
  onRename,
  onDelete,
  onSources,
}: {
  p: Presentation
  wpm: number
  onOpen: () => void
  onPresent: () => void
  onPresentCall: () => void
  onRename: () => void
  onDelete: () => void
  onSources: () => void
}) {
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const words = presentationWordCount(p)
  const first = p.slides[0]
  return (
    <li className="group relative -mx-3 flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <div className="w-[104px] shrink-0 overflow-hidden rounded-md border border-line">
          {first ? <SlideImage slide={first} aspectRatio={p.aspectRatio} thumb /> : <div className="aspect-video bg-elevated" />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium">{p.name}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
            <span>{plural(p.slides.length, 'slide')}</span>
            <Dot />
            <span>Edited {formatRelative(p.updatedAt).replace(/^Just now$/, 'just now')}</span>
            <Dot />
            <span title={`${words} words at ${wpm} words per minute`}>{words ? `~${formatDuration(estimateMs(words, wpm))}` : 'No script yet'}</span>
            {!!p.sources?.length && (
              <>
                <Dot />
                <span>{plural(p.sources.length, 'source')}</span>
              </>
            )}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label="Add sources for SI — notes, FAQs, documents" size="sm" onClick={onSources}>
          <Plus size={16} />
        </IconButton>
        <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={onOpen}>
          Edit
        </Button>
        <Button size="sm" title="Teleprompter in its own window; share only the slides on Meet, Zoom or Teams" icon={<MonitorUp size={13} />} onClick={onPresentCall}>
          On a call
        </Button>
        <Button size="sm" variant="primary" icon={<Play size={12} fill="currentColor" />} onClick={onPresent}>
          Present
        </Button>
        <div ref={menuRef} className="relative">
          <IconButton label="More" size="sm" onClick={() => setMenu((m) => !m)}>
            <MoreHorizontal size={16} />
          </IconButton>
          {menu && (
            <div className="absolute top-8 right-0 z-30 w-40 rounded-xl border border-line-strong bg-elevated p-1 shadow-xl shadow-black/30 animate-fade-in">
              <MenuItem
                onClick={() => {
                  setMenu(false)
                  onRename()
                }}
              >
                <Pencil size={13} /> Rename
              </MenuItem>
              <MenuItem
                danger
                onClick={() => {
                  setMenu(false)
                  onDelete()
                }}
              >
                <Trash2 size={13} /> Delete
              </MenuItem>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] ${danger ? 'text-danger hover:bg-danger/10' : 'hover:bg-hover'}`}
    >
      {children}
    </button>
  )
}

function RenameDialog({ item, onClose, onSave }: { item: Presentation | null; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('')
  useEffect(() => setName(item?.name ?? ''), [item])
  const submit = () => name.trim() && onSave(name.trim())
  return (
    <Modal
      open={!!item}
      title="Rename presentation"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="h-9 w-full rounded-lg border border-line bg-app px-3 text-[14px] text-fg outline-none focus:border-accent"
      />
    </Modal>
  )
}

function EmptyState({ onPick }: { onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="mt-6 flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-8 py-20 text-center transition-colors hover:border-accent/60 hover:bg-surface"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <PresentationIcon size={22} />
      </div>
      <p className="mt-5 text-[15px] font-medium">Drop a presentation here</p>
      <p className="mt-1.5 max-w-sm text-[13px] text-muted">
        PDF, PPTX or PPT. Present detects every slide, extracts its text, and lets you write exactly what you want to say.
      </p>
    </button>
  )
}

function Dot() {
  return <span className="text-subtle">·</span>
}

/** Desktop: present and SI need the same account as the website. */
function DesktopSignInBanner() {
  const navigate = useNavigate()
  const ready = useAccount((s) => s.ready)
  const session = useAccount((s) => s.session)
  if (platform.kind !== 'desktop' || !ready || session) return null
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3">
      <p className="text-[13px] leading-relaxed text-fg">
        Sign in with the email you use on <span className="font-medium">{SITE_URL.replace('https://', '')}</span> — your trial or plan comes with it.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate('/signup')}>
          Create account
        </Button>
        <Button size="sm" variant="primary" onClick={() => navigate('/login')}>
          Sign in
        </Button>
      </div>
    </div>
  )
}
