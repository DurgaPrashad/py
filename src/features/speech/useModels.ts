import { useCallback, useEffect, useState } from 'react'
import { speech, type DownloadEvent } from '../../services/speech/speechService'
import { errorMessage } from '../../services/tauri'
import type { ModelInfo } from '../../types'

/** Installed / downloadable speech models plus live download progress. */
export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [downloads, setDownloads] = useState<Record<string, DownloadEvent>>({})
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setModels(await speech.listModels())
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    refresh()
    const unlisten = speech.onDownload((e) => {
      setDownloads((d) => ({ ...d, [e.id]: e }))
      if (e.done) {
        if (e.error && e.error !== 'download cancelled') setError(`Download failed: ${e.error}`)
        refresh()
        setTimeout(() => setDownloads((d) => {
          const next = { ...d }
          delete next[e.id]
          return next
        }), 600)
      }
    })
    return () => {
      unlisten.then((f) => f())
    }
  }, [refresh])

  const download = useCallback(async (id: string) => {
    setError(null)
    setDownloads((d) => ({ ...d, [id]: { id, downloaded: 0, total: 0, done: false, error: null } }))
    try {
      await speech.downloadModel(id)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  return { models, downloads, error, refresh, download, setError }
}
