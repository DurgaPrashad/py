import { DEFAULT_COMMAND_PHRASES } from '../../services/alignment/commands'
import { isTauri } from '../../services/tauri'
import type { Settings } from '../../types'

export const DEFAULT_SETTINGS: Settings = {
  version: 2,
  speech: {
    // The browser runs Whisper on WebGPU; Tiny keeps updates live there.
    modelId: isTauri() ? 'base.en' : 'tiny.en',
    deviceId: null,
    language: 'en',
    stepMs: 150,
    windowMs: 5000,
    silenceMs: 600,
    vadSensitivity: 0.5,
    fastDecode: true,
    biasWithScript: false,
  },
  teleprompter: {
    wordsVisible: 8,
    fontSize: 40,
    width: 72,
    opacity: 0.92,
    position: 'camera',
    align: 'center',
    highlightStyle: 'pill',
    highlightTarget: 'spoken',
    transitionMs: 140,
    dimSpoken: true,
    uppercase: false,
    showTranscript: false,
  },
  theme: 'dark',
  voiceCommands: {
    enabled: true,
    phrases: DEFAULT_COMMAND_PHRASES,
  },
  autoAdvance: {
    enabled: false,
    delayMs: 1500,
  },
  display: {
    mode: 'fullscreen',
    audienceMonitor: null,
    showLevelMeter: false,
    autoHideControls: true,
  },
  shortcuts: {
    next: 'ArrowRight',
    previous: 'ArrowLeft',
    togglePause: 'Space',
    restart: 'KeyR',
    exit: 'Escape',
  },
  wordsPerMinute: 140,
}

type Plain = Record<string, unknown>

const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Deep-merge stored settings over defaults so new fields get sane values. */
export function mergeSettings(stored: unknown): Settings {
  const merge = (base: Plain, over: unknown): Plain => {
    if (!isPlain(over)) return base
    const out: Plain = { ...base }
    for (const key of Object.keys(base)) {
      const b = base[key]
      const o = over[key]
      if (o === undefined) continue
      if (isPlain(b) && isPlain(o)) out[key] = merge(b, o)
      else if (typeof o === typeof b || b === null) out[key] = o
    }
    return out
  }
  const merged = merge(DEFAULT_SETTINGS as unknown as Plain, stored) as unknown as Settings
  return migrate(merged, isPlain(stored) ? Number(stored.version ?? 1) : DEFAULT_SETTINGS.version)
}

/** Values a user still has at an old default move to the new default. */
function migrate(s: Settings, from: number): Settings {
  if (from < 2) {
    const sp = { ...s.speech }
    const tp = { ...s.teleprompter }
    if (sp.stepMs === 300) sp.stepMs = DEFAULT_SETTINGS.speech.stepMs
    if (sp.windowMs === 6000) sp.windowMs = DEFAULT_SETTINGS.speech.windowMs
    if (tp.transitionMs === 260) tp.transitionMs = DEFAULT_SETTINGS.teleprompter.transitionMs
    if (tp.position === 'top' && tp.width === 88) {
      tp.position = DEFAULT_SETTINGS.teleprompter.position
      tp.width = DEFAULT_SETTINGS.teleprompter.width
    }
    s = { ...s, speech: sp, teleprompter: tp }
  }
  return { ...s, version: DEFAULT_SETTINGS.version }
}
