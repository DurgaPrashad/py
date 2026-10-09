import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { InputDevice, ModelInfo, Settings, TranscriptEvent } from '../../types'
import { webSpeech } from '../../platform/web/speech/engine'
import { invoke, isTauri } from '../tauri'

export type EngineState = 'idle' | 'loading' | 'listening' | 'stopped' | 'error'

export interface StatusEvent {
  state: EngineState
  message: string
}

export interface LevelEvent {
  level: number
  speaking: boolean
}

export interface DownloadEvent {
  id: string
  downloaded: number
  total: number
  done: boolean
  error: string | null
}

export interface StartInfo {
  device: string
  model: string
}

/** Thin, typed wrapper over the native speech engine. */
const desktopSpeech = {
  start(cfg: Settings['speech'], prompt = ''): Promise<StartInfo> {
    return invoke<StartInfo>('speech_start', {
      options: {
        modelId: cfg.modelId,
        deviceId: cfg.deviceId,
        language: cfg.language,
        stepMs: cfg.stepMs,
        windowMs: cfg.windowMs,
        silenceMs: cfg.silenceMs,
        vadSensitivity: cfg.vadSensitivity,
        fastDecode: cfg.fastDecode,
        usePrompt: cfg.biasWithScript,
        prompt,
      },
    })
  },
  stop: () => invoke<void>('speech_stop'),
  isRunning: () => invoke<boolean>('speech_is_running'),
  setPrompt: (prompt: string) => invoke<void>('speech_set_prompt', { prompt }),
  listDevices: () => invoke<InputDevice[]>('speech_list_devices'),
  listModels: () => invoke<ModelInfo[]>('speech_list_models'),
  downloadModel: (id: string) => invoke<void>('speech_download_model', { id }),
  cancelDownload: (id: string) => invoke<void>('speech_cancel_download', { id }),
  importModel: (path: string) => invoke<ModelInfo>('speech_import_model', { path }),
  deleteModel: (id: string) => invoke<void>('speech_delete_model', { id }),

  onTranscript: (cb: (e: TranscriptEvent) => void): Promise<UnlistenFn> =>
    listen<TranscriptEvent>('speech://transcript', (e) => cb(e.payload)),
  onLevel: (cb: (e: LevelEvent) => void): Promise<UnlistenFn> => listen<LevelEvent>('speech://level', (e) => cb(e.payload)),
  onStatus: (cb: (e: StatusEvent) => void): Promise<UnlistenFn> =>
    listen<StatusEvent>('speech://status', (e) => cb(e.payload)),
  onDownload: (cb: (e: DownloadEvent) => void): Promise<UnlistenFn> =>
    listen<DownloadEvent>('speech://model-download', (e) => cb(e.payload)),
  /** The native engine separates slides by word timestamps instead. */
  boundary: () => {},
}

/**
 * Local speech recognition: whisper.cpp in the desktop app, Whisper on
 * WebGPU / WASM in the browser. Same events either way.
 */
export const speech: Omit<typeof desktopSpeech, 'importModel'> & { importModel?: typeof desktopSpeech.importModel } = isTauri()
  ? desktopSpeech
  : webSpeech

/** Errors from `speech.start` that mean "no model installed yet". */
export function isMissingModelError(message: string): boolean {
  return message.startsWith('MODEL_MISSING:')
}
