import type { MonitorInfo, Presentation } from '../types'

export interface CameraAnchor {
  /** CSS px from the window's left edge to the camera (display centre). */
  centerX: number
  /** CSS px from the window's top edge to just below the camera / notch. */
  top: number
}

export interface LegacySlide {
  slideNumber: number
  texts: string[]
  notes: string
}

type Unlisten = () => void

/**
 * Everything that differs between the desktop app (Tauri + Rust) and the
 * hosted web app. Paths are opaque strings: filesystem paths on desktop,
 * `idb:` / `file:` keys in the browser.
 */
export interface Platform {
  kind: 'desktop' | 'web'
  storage: {
    listProjects(): Promise<Presentation[]>
    loadProject(id: string): Promise<Presentation>
    saveProject(p: Presentation): Promise<void>
    deleteProject(id: string): Promise<void>
    importSource(id: string, path: string): Promise<string>
    writeAsset(projectId: string, name: string, bytes: Uint8Array): Promise<string>
    readBytes(path: string): Promise<Uint8Array>
    loadSettings(): Promise<unknown>
    saveSettings(settings: unknown): Promise<void>
    dataLocation(): Promise<string>
  }
  /** URL for a stored asset, or null until `resolveAssetUrl` has loaded it. */
  assetUrl(path: string): string | null
  resolveAssetUrl(path: string): Promise<string>
  docs: {
    officeConverterPath(): Promise<string | null>
    convertToPdf(path: string, outDir: string): Promise<string>
    parsePptLegacy(path: string): Promise<LegacySlide[]>
  }
  files: {
    /** Let the user choose a file; returns an opaque path. */
    pick(extensions: string[], label: string): Promise<string | null>
    /** File drag & drop onto the window. */
    onDrop(handler: (paths: string[]) => void, onHover: (over: boolean) => void): Unlisten
    canImportModels: boolean
  }
  windows: {
    setFullscreen(on: boolean): Promise<void>
    /** Slides-only window. Returns true if it went fullscreen on another display. */
    openSlides(projectId: string, opts: { monitorIndex: number | null; share: boolean }): Promise<boolean>
    closeSlides(): Promise<void>
    sendSlide(index: number): void
    onSlidesReady(cb: () => void): Unlisten
    onSlidesClosed(cb: () => void): Unlisten
    listMonitors(): Promise<MonitorInfo[]>
    cameraAnchor(): Promise<CameraAnchor>
    onMoved(cb: () => void): Unlisten
    /** Opens OS screen-recording permissions, when the platform has such a page. */
    openScreenRecordingSettings: (() => Promise<void>) | null
    /** Desktop: shrink the presenter into a floating strip under the camera. */
    setPresenterCompact: ((compact: boolean, width: number, height: number) => Promise<void>) | null
  }
  audience: {
    onSlide(cb: (index: number) => void): Unlisten
    ready(): void
  }
}
