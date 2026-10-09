import type { TranscriptEvent } from '../../../types'

type DType = 'fp32' | 'fp16' | 'q8' | 'q4' | 'int8' | 'uint8' | 'bnb4' | 'q4f16'

export interface WebModelSpec {
  id: string
  repo: string
  label: string
  description: string
  /** Approximate one-time download for the WebGPU / WASM variants. */
  webgpuMb: number
  wasmMb: number
  webgpuDtype: Record<string, DType>
  wasmDtype: Record<string, DType>
}

/** Whisper models that run in the browser (ONNX, via transformers.js). */
export const WEB_MODELS: WebModelSpec[] = [
  {
    id: 'tiny.en',
    repo: 'onnx-community/whisper-tiny.en',
    label: 'Tiny · English',
    description: 'Fast in the browser (~0.2 s per update on a recent Mac). Recommended.',
    webgpuMb: 120,
    wasmMb: 41,
    webgpuDtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    wasmDtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
  },
  {
    id: 'base.en',
    repo: 'onnx-community/whisper-base.en',
    label: 'Base · English',
    description: 'More accurate; needs a fast GPU for live use.',
    webgpuMb: 206,
    wasmMb: 77,
    webgpuDtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
    wasmDtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
  },
]

const SUFFIX: Record<string, string> = { fp32: '', fp16: '_fp16', q8: '_quantized', int8: '_int8', uint8: '_uint8', q4: '_q4', bnb4: '_bnb4', q4f16: '_q4f16' }

/** ONNX files a model needs for the given precision map. */
export function modelFiles(dtype: Record<string, DType>): string[] {
  return Object.entries(dtype).map(([name, d]) => `onnx/${name}${SUFFIX[d] ?? ''}.onnx`)
}

export interface StreamConfig {
  stepMs: number
  windowMs: number
  silenceMs: number
  vadSensitivity: number
}

export type WorkerIn =
  | { type: 'preload'; modelId: string; runtimeUrl: string }
  | { type: 'start'; modelId: string; runtimeUrl: string; config: StreamConfig; devAudioUrl?: string | null }
  | { type: 'port'; port: MessagePort }
  | { type: 'audio'; samples: Float32Array }
  | { type: 'boundary' }
  | { type: 'stop' }

export type WorkerOut =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'loaded'; device: string }
  | { type: 'ready'; device: string }
  | { type: 'transcript'; event: TranscriptEvent }
  | { type: 'speaking'; value: boolean }
  | { type: 'level'; rms: number }
  | { type: 'error'; message: string }
