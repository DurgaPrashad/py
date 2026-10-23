import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { emit, emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-dialog'
import type { MonitorInfo, Presentation } from '../types'
import type { CameraAnchor, LegacySlide, Platform } from './types'

/** Wrap an async Tauri unlisten into a synchronous one. */
function sync(p: Promise<UnlistenFn>): () => void {
  let done = false
  let fn: UnlistenFn | null = null
  p.then((f) => (done ? f() : (fn = f)))
  return () => {
    done = true
    fn?.()
  }
}

export const desktop: Platform = {
  kind: 'desktop',
  storage: {
    listProjects: () => invoke<Presentation[]>('storage_list_projects'),
    loadProject: (id) => invoke<Presentation>('storage_load_project', { id }),
    saveProject: (project) => invoke('storage_save_project', { project }),
    deleteProject: (id) => invoke('storage_delete_project', { id }),
    importSource: (id, sourcePath) => invoke<string>('storage_import_source', { id, sourcePath }),
    writeAsset: (projectId, name, bytes) =>
      invoke<string>('storage_write_asset', bytes, { headers: { 'x-project-id': projectId, 'x-asset-name': name } }),
    readBytes: async (path) => new Uint8Array(await invoke<ArrayBuffer>('read_file_bytes', { path })),
    loadSettings: () => invoke<unknown>('storage_load_settings'),
    saveSettings: (settings) => invoke('storage_save_settings', { settings }),
    dataLocation: async () => (await invoke<{ dataDir: string }>('app_paths')).dataDir,
  },
  assetUrl: (path) => (/^(blob:|https?:|data:)/.test(path) ? path : convertFileSrc(path)),
  resolveAssetUrl: async (path) => (/^(blob:|https?:|data:)/.test(path) ? path : convertFileSrc(path)),
  docs: {
    officeConverterPath: () => invoke<string | null>('office_converter_path'),
    convertToPdf: (path, outDir) => invoke<string>('office_convert_to_pdf', { path, outDir }),
    parsePptLegacy: (path) => invoke<LegacySlide[]>('parse_ppt_legacy', { path }),
  },
  files: {
    pick: async (extensions, label) => {
      const path = await open({ multiple: false, directory: false, filters: [{ name: label, extensions }] })
      return typeof path === 'string' ? path : null
    },
    onDrop: (handler, onHover) =>
      sync(
        getCurrentWebview().onDragDropEvent((event) => {
          const p = event.payload
          if (p.type === 'enter' || p.type === 'over') onHover(true)
          else if (p.type === 'leave') onHover(false)
          else if (p.type === 'drop') {
            onHover(false)
            if (p.paths.length) handler(p.paths)
          }
        }),
      ),
    canImportModels: true,
  },
  windows: {
    setFullscreen: (fullscreen) => invoke('set_main_fullscreen', { fullscreen }),
    openSlides: (projectId, { monitorIndex, share }) => invoke<boolean>('open_audience_window', { projectId, monitorIndex, share }),
    closeSlides: () => invoke('close_audience_window'),
    sendSlide: (index) => void emitTo('audience', 'present://slide', { index }).catch(() => {}),
    onSlidesReady: (cb) => sync(listen('present://audience-ready', () => cb())),
    onSlidesClosed: (cb) => sync(listen('present://audience-closed', () => cb())),
    listMonitors: () => invoke<MonitorInfo[]>('list_monitors'),
    cameraAnchor: () => invoke<CameraAnchor>('camera_anchor'),
    onMoved: (cb) => sync(getCurrentWindow().onMoved(() => cb())),
    openScreenRecordingSettings: () => invoke('open_screen_recording_settings'),
    setPresenterCompact: (compact, width, height) => invoke('set_presenter_compact', { compact, width, height }),
  },
  openExternal: (url) => invoke('open_external', { url }),
  audience: {
    onSlide: (cb) => sync(listen<{ index: number }>('present://slide', (e) => cb(e.payload.index))),
    ready: () => void emit('present://audience-ready'),
  },
}
