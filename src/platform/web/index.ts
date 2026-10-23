import type { Presentation } from '../../types'
import type { CameraAnchor, Platform } from '../types'

/*
 * Browser implementation. Everything stays in this browser: presentations
 * and slide images in IndexedDB, settings in localStorage.
 */

// ---------------------------------------------------------------- IndexedDB

const DB_NAME = 'reflex-presenter'
let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode)
        const req = run(t.objectStore(store))
        t.oncomplete = () => resolve(req ? req.result : (undefined as T))
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error ?? new Error('storage transaction aborted'))
      }),
  )
}

const assetKey = (path: string) => path.replace(/^idb:/, '')

// ---------------------------------------------------------------- files

/** Files chosen in this session, addressed as `file:<id>/<name>`. */
const files = new Map<string, File>()

function register(file: File): string {
  const key = `file:${crypto.randomUUID()}/${file.name}`
  files.set(key, file)
  return key
}

async function readBytes(path: string): Promise<Uint8Array> {
  if (path.startsWith('file:')) {
    const f = files.get(path)
    if (!f) throw new Error('The selected file is no longer available. Choose it again.')
    return new Uint8Array(await f.arrayBuffer())
  }
  if (path.startsWith('idb:')) {
    const blob = await tx<Blob | undefined>('assets', 'readonly', (s) => s.get(assetKey(path)))
    if (!blob) throw new Error(`Missing stored file ${path}`)
    return new Uint8Array(await blob.arrayBuffer())
  }
  return new Uint8Array(await (await fetch(path)).arrayBuffer())
}

const urlCache = new Map<string, string>()

async function resolveAssetUrl(path: string): Promise<string> {
  if (!path.startsWith('idb:')) return path
  const cached = urlCache.get(path)
  if (cached) return cached
  const blob = await tx<Blob | undefined>('assets', 'readonly', (s) => s.get(assetKey(path)))
  if (!blob) return ''
  const url = URL.createObjectURL(blob)
  urlCache.set(path, url)
  return url
}

// ---------------------------------------------------------------- slides window

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('reflex-present') : null
let slidesWindow: Window | null = null

function onChannel(type: string, cb: (data: { type: string; index?: number }) => void) {
  const handler = (e: MessageEvent) => e.data?.type === type && cb(e.data)
  channel?.addEventListener('message', handler)
  return () => channel?.removeEventListener('message', handler)
}

// ---------------------------------------------------------------- platform

export const web: Platform = {
  kind: 'web',
  storage: {
    listProjects: () => tx<Presentation[]>('projects', 'readonly', (s) => s.getAll()),
    async loadProject(id) {
      const p = await tx<Presentation | undefined>('projects', 'readonly', (s) => s.get(id))
      if (!p) throw new Error('Presentation not found')
      return p
    },
    saveProject: (p) => tx('projects', 'readwrite', (s) => void s.put(p)),
    async deleteProject(id) {
      await tx('projects', 'readwrite', (s) => void s.delete(id))
      await tx('assets', 'readwrite', (s) => void s.delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`)))
      for (const [k, url] of urlCache) {
        if (k.startsWith(`idb:${id}/`)) {
          URL.revokeObjectURL(url)
          urlCache.delete(k)
        }
      }
    },
    async importSource(id, path) {
      const bytes = await readBytes(path)
      const ext = path.split('.').pop()?.toLowerCase() ?? 'bin'
      const key = `${id}/source.${ext}`
      await tx('assets', 'readwrite', (s) => void s.put(new Blob([bytes as Uint8Array<ArrayBuffer>]), key))
      return `idb:${key}`
    },
    async writeAsset(projectId, name, bytes) {
      const key = `${projectId}/${name}`
      const type = name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.png') ? 'image/png' : 'application/octet-stream'
      await tx('assets', 'readwrite', (s) => void s.put(new Blob([bytes as Uint8Array<ArrayBuffer>], { type }), key))
      return `idb:${key}`
    },
    readBytes,
    async loadSettings() {
      try {
        return JSON.parse(localStorage.getItem('reflex.settings') ?? 'null')
      } catch {
        return null
      }
    },
    async saveSettings(settings) {
      try {
        localStorage.setItem('reflex.settings', JSON.stringify(settings))
      } catch {
        // storage full or disabled: settings stay in memory
      }
    },
    dataLocation: async () => 'This browser (IndexedDB) — nothing is uploaded',
  },
  assetUrl: (path) => (path.startsWith('idb:') ? (urlCache.get(path) ?? null) : path),
  resolveAssetUrl,
  docs: {
    officeConverterPath: async () => null,
    convertToPdf: async () => {
      throw new Error('Office conversion needs the desktop app')
    },
    parsePptLegacy: async () => {
      throw new Error('Legacy .ppt files need the desktop app. In PowerPoint or Keynote, save the deck as .pptx or PDF and import that.')
    },
  },
  files: {
    pick: (extensions) =>
      new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = extensions.map((e) => `.${e}`).join(',')
        input.onchange = () => resolve(input.files?.[0] ? register(input.files[0]) : null)
        input.addEventListener('cancel', () => resolve(null))
        input.click()
      }),
    onDrop(handler, onHover) {
      let depth = 0
      const enter = (e: DragEvent) => {
        if (!e.dataTransfer?.types.includes('Files')) return
        e.preventDefault()
        depth++
        onHover(true)
      }
      const over = (e: DragEvent) => {
        if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
      }
      const leave = () => {
        depth = Math.max(0, depth - 1)
        if (!depth) onHover(false)
      }
      const drop = (e: DragEvent) => {
        e.preventDefault()
        depth = 0
        onHover(false)
        const list = [...(e.dataTransfer?.files ?? [])]
        if (list.length) handler(list.map(register))
      }
      window.addEventListener('dragenter', enter)
      window.addEventListener('dragover', over)
      window.addEventListener('dragleave', leave)
      window.addEventListener('drop', drop)
      return () => {
        window.removeEventListener('dragenter', enter)
        window.removeEventListener('dragover', over)
        window.removeEventListener('dragleave', leave)
        window.removeEventListener('drop', drop)
      }
    },
    canImportModels: false,
  },
  windows: {
    async setFullscreen(on) {
      try {
        if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen()
        if (!on && document.fullscreenElement) await document.exitFullscreen()
      } catch {
        // Needs a user gesture; the presenter offers a fullscreen button.
      }
    },
    async openSlides(projectId) {
      const url = `${import.meta.env.BASE_URL}audience/${projectId}`
      if (slidesWindow && !slidesWindow.closed) {
        slidesWindow.focus()
        return false
      }
      slidesWindow = window.open(url, 'reflex-slides', 'popup=yes,width=1280,height=760')
      if (!slidesWindow) throw new Error('The browser blocked the slides window. Allow pop-ups for this site, then click the screen icon again.')
      return false
    },
    async closeSlides() {
      slidesWindow?.close()
      slidesWindow = null
    },
    sendSlide: (index) => channel?.postMessage({ type: 'slide', index }),
    onSlidesReady: (cb) => onChannel('ready', () => cb()),
    onSlidesClosed(cb) {
      const t = setInterval(() => {
        if (slidesWindow?.closed) {
          slidesWindow = null
          cb()
        }
      }, 800)
      return () => clearInterval(t)
    },
    listMonitors: async () => [],
    async cameraAnchor(): Promise<CameraAnchor> {
      // The camera sits at the top centre of the screen the window is on.
      const left = (screen as Screen & { availLeft?: number }).availLeft ?? 0
      const centerX = document.fullscreenElement ? window.innerWidth / 2 : left + screen.width / 2 - window.screenX
      return { centerX, top: 0 }
    },
    onMoved(cb) {
      // Browsers have no move event; poll the window position cheaply.
      let x = window.screenX
      let y = window.screenY
      const t = setInterval(() => {
        if (window.screenX !== x || window.screenY !== y) {
          x = window.screenX
          y = window.screenY
          cb()
        }
      }, 500)
      return () => clearInterval(t)
    },
    openScreenRecordingSettings: null,
    setPresenterCompact: null,
  },
  openExternal: async (url) => {
    window.open(url, '_blank', 'noopener')
  },
  audience: {
    onSlide: (cb) => onChannel('slide', (d) => cb(d.index ?? 0)),
    ready: () => channel?.postMessage({ type: 'ready' }),
  },
}
