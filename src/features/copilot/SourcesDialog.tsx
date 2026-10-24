import { FileText, Loader2, Lock, NotebookPen, Plus, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { toast } from '../../components/Toast'
import { PLANS, SITE_URL } from '../../config'
import { platform } from '../../platform'
import { errorMessage } from '../../services/tauri'
import type { Presentation } from '../../types'
import { formatRelative } from '../../utils/format'
import { entitlements, useAccount } from '../account/account'
import { fileSource, SOURCE_FILE_TYPES, sourceStats, textSource } from './sources'

/**
 * Add what you're explaining — notes, FAQs, product docs, financials — so SI
 * can use it in answers. Text sources come with SI; uploading files is part of
 * the SI yearly plan. Everything stays on this device with the presentation.
 */
export function SourcesDialog({ presentation, onClose, onSave }: { presentation: Presentation | null; onClose: () => void; onSave: (p: Presentation) => Promise<void> }) {
  const navigate = useNavigate()
  const session = useAccount((s) => s.session)
  const profile = useAccount((s) => s.profile)
  const ent = entitlements(profile)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [writing, setWriting] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const p = presentation
  const sources = p?.sources ?? []

  const save = async (next: Presentation) => {
    try {
      await onSave(next)
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const addText = async () => {
    if (!p || !text.trim()) return
    await save({ ...p, sources: [...sources, textSource(title, text)] })
    setTitle('')
    setText('')
    setWriting(false)
  }

  const addFiles = async (files: FileList | null) => {
    if (!p || !files?.length) return
    setBusy(true)
    const added = []
    for (const f of Array.from(files)) {
      try {
        added.push(await fileSource(f))
      } catch (e) {
        toast(errorMessage(e), 'error')
      }
    }
    if (added.length) {
      await save({ ...p, sources: [...sources, ...added] })
      toast(`Added ${added.length} source${added.length > 1 ? 's' : ''}`, 'success')
    }
    setBusy(false)
  }

  const upgrade = () => {
    if (platform.kind === 'web') navigate('/account?plan=si_yearly')
    else void platform.openExternal(`${SITE_URL}/account?plan=si_yearly`).catch(() => null)
  }

  return (
    <Modal open={!!p} title={`Sources · ${p?.name ?? ''}`} onClose={onClose} width={620}>
      <p className="-mt-1 leading-relaxed">
        Add what you're explaining — notes, FAQs, product details, financials, research. SI (Super Intelligence) uses your sources, slides and scripts
        to tell you what to say when you're asked something. Sources stay on this device with the presentation.
      </p>

      <div className="mt-4 max-h-[260px] overflow-y-auto rounded-xl border border-line">
        {sources.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-subtle">No sources yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                {s.kind === 'file' ? <FileText size={16} className="shrink-0 text-accent" /> : <NotebookPen size={16} className="shrink-0 text-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-fg">{s.title}</div>
                  <div className="truncate text-[11.5px] text-subtle">
                    {s.fileName ? `${s.fileName} · ` : 'Text · '}
                    {sourceStats(s)} · added {formatRelative(s.addedAt).replace(/^(Just now|Yesterday)$/, (m) => m.toLowerCase())}
                  </div>
                </div>
                <IconButton
                  label="Remove source"
                  size="sm"
                  onClick={() => p && void save({ ...p, sources: sources.filter((x) => x.id !== s.id) })}
                >
                  <Trash2 size={13} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      {writing ? (
        <div className="mt-4 rounded-xl border border-line bg-app p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title, e.g. Investor FAQ"
            className="h-8 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px] text-fg outline-none focus:border-accent"
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder="Paste or type the facts you want SI to know — answers to common questions, metrics, pricing, team, roadmap…"
            className="mt-2 w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-fg outline-none focus:border-accent"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" onClick={() => setWriting(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={!text.trim()} onClick={addText}>
              Add source
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left hover:bg-hover"
          >
            <Plus size={16} className="shrink-0 text-accent" />
            <span>
              <span className="block text-[13px] font-medium text-fg">Add text</span>
              <span className="block text-[11.5px] text-subtle">Paste notes, FAQs or facts</span>
            </span>
          </button>
          {ent.canUploadSources ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left hover:bg-hover disabled:opacity-60"
            >
              {busy ? <Loader2 size={16} className="shrink-0 animate-spin text-accent" /> : <Upload size={16} className="shrink-0 text-accent" />}
              <span>
                <span className="block text-[13px] font-medium text-fg">{busy ? 'Reading files…' : 'Upload files'}</span>
                <span className="block text-[11.5px] text-subtle">PDF, Word (.docx), text, Markdown, CSV</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={session ? upgrade : () => navigate('/login')}
              className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-3 text-left hover:brightness-110"
            >
              <Lock size={16} className="shrink-0 text-accent" />
              <span>
                <span className="block text-[13px] font-medium text-fg">Upload PDFs & documents</span>
                <span className="block text-[11.5px] text-muted">With the SI yearly plan · ${PLANS.si_yearly.price}/year</span>
              </span>
            </button>
          )}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept={SOURCE_FILE_TYPES}
        multiple
        hidden
        onChange={(e) => {
          void addFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <p className="mt-3 text-[11.5px] text-subtle">SI reads up to about 300,000 characters of slides, notes and sources per question.</p>
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}
