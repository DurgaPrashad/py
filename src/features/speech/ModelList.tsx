import { Check, Download, FolderOpen, Trash2, X } from 'lucide-react'
import { Button, IconButton } from '../../components/Button'
import { toast } from '../../components/Toast'
import { platform } from '../../platform'
import { speech } from '../../services/speech/speechService'
import { errorMessage } from '../../services/tauri'
import { formatBytes } from '../../utils/format'
import { useModels } from './useModels'

interface Props {
  selected: string
  onSelect: (id: string) => void
  /** Hide multilingual / large models (first-run setup). */
  compact?: boolean
}

/**
 * Local Whisper models. Downloading is a one-time, user-initiated step;
 * after that recognition runs fully offline. Users can also import a ggml
 * model file they already have.
 */
export function ModelList({ selected, onSelect, compact }: Props) {
  const { models, downloads, error, refresh, download } = useModels()
  const shown = compact ? models.filter((m) => m.englishOnly && !m.custom) : models

  const importFile = async () => {
    const path = await platform.files.pick(['bin'], 'Whisper model')
    if (!path || !speech.importModel) return
    try {
      const info = await speech.importModel(path)
      await refresh()
      onSelect(info.id)
      toast(`Imported ${info.label}`, 'success')
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const remove = async (id: string) => {
    try {
      await speech.deleteModel(id)
      await refresh()
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {shown.map((m) => {
        const dl = downloads[m.id]
        const active = selected === m.id
        const pct = dl && dl.total ? Math.round((dl.downloaded / dl.total) * 100) : 0
        return (
          <div
            key={m.id}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
              active && m.installed ? 'border-accent/50 bg-accent-soft' : 'border-line bg-surface'
            }`}
          >
            <button
              type="button"
              disabled={!m.installed}
              onClick={() => onSelect(m.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  active && m.installed ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong'
                }`}
              >
                {active && m.installed && <Check size={10} strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[13px] font-medium">
                  {m.label}
                  {m.id === (platform.kind === 'web' ? 'tiny.en' : 'base.en') && (
                    <span className="rounded bg-line px-1.5 py-px text-[10.5px] text-muted">Recommended</span>
                  )}
                </span>
                <span className="block truncate text-[12px] text-muted">{m.description}</span>
              </span>
            </button>
            {dl && !dl.done ? (
              <div className="flex w-44 items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-line-strong">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 text-right text-[11.5px] text-muted tabular">{dl.total ? formatBytes(dl.downloaded) : 'Starting…'}</span>
                <IconButton label="Cancel download" size="sm" onClick={() => speech.cancelDownload(m.id)}>
                  <X size={14} />
                </IconButton>
              </div>
            ) : m.installed ? (
              <div className="flex items-center gap-1">
                <span className="text-[12px] text-subtle tabular">{m.sizeMb} MB</span>
                <IconButton label="Delete model" size="sm" onClick={() => remove(m.id)}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ) : (
              <Button size="sm" icon={<Download size={13} />} onClick={() => download(m.id)}>
                {m.sizeMb} MB
              </Button>
            )}
          </div>
        )
      })}
      {error && <p className="selectable px-1 text-[12px] text-danger">{error}</p>}
      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-[11.5px] text-subtle">
          {platform.kind === 'web'
            ? 'Downloads once from Hugging Face and is cached by this browser; recognition runs on this device.'
            : 'Models download once from Hugging Face, then everything runs offline.'}
        </p>
        {platform.files.canImportModels && (
          <Button size="sm" variant="ghost" icon={<FolderOpen size={13} />} onClick={importFile}>
            Import model file
          </Button>
        )}
      </div>
    </div>
  )
}
