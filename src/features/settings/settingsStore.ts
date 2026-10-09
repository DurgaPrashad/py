import { create } from 'zustand'
import { platform } from '../../platform'
import type { Settings } from '../../types'
import { DEFAULT_SETTINGS, mergeSettings } from './defaults'

interface SettingsState {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  /** Shallow-merge a patch into one settings section and persist. */
  update: <K extends keyof Settings>(section: K, patch: Settings[K] extends object ? Partial<Settings[K]> : Settings[K]) => void
  reset: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

function persist(settings: Settings) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    platform.storage.saveSettings(settings).catch((e) => console.error('saving settings failed', e))
  }, 250)
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    try {
      const stored = await platform.storage.loadSettings()
      set({ settings: mergeSettings(stored), loaded: true })
    } catch (e) {
      console.error('loading settings failed', e)
      set({ loaded: true })
    }
  },
  update(section, patch) {
    const current = get().settings
    const value = current[section]
    const nextValue =
      typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value, ...(patch as object) } : patch
    const settings = { ...current, [section]: nextValue } as Settings
    set({ settings })
    persist(settings)
  },
  reset() {
    set({ settings: DEFAULT_SETTINGS })
    persist(DEFAULT_SETTINGS)
  },
}))

/** Apply the theme setting to <html>. */
export function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement
  const dark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
}
