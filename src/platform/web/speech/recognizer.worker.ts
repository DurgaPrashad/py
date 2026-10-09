/// <reference lib="webworker" />
/*
 * In-browser speech recognition worker. Same streaming design as the native
 * engine (src-tauri/src/speech/engine.rs): VAD-gated utterances, the latest
 * few seconds re-transcribed every step, partial + final hypotheses. Whisper
 * runs on WebGPU (or WASM as a fallback) via transformers.js; audio never
 * leaves the device.
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers'
import type { TranscriptEvent } from '../../../types'
import { cleanText, collapseLoops, FRAME, SAMPLE_RATE, SampleBuffer, Vad } from './vad'
import { WEB_MODELS, type WorkerIn, type WorkerOut } from './protocol'

env.allowLocalModels = false

/** The ONNX runtime is served with the app instead of from a CDN. */
function setRuntimePath(url: string) {
  if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = url
}

const post = (msg: WorkerOut, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer)

let asr: AutomaticSpeechRecognitionPipeline | null = null
let loadedModel = ''
let device: 'webgpu' | 'wasm' = 'wasm'

async function pickDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    if (gpu && (await gpu.requestAdapter())) return 'webgpu'
  } catch {
    // fall through
  }
  return 'wasm'
}

async function load(modelId: string, reportProgress: boolean) {
  if (asr && loadedModel === modelId) return
  const spec = WEB_MODELS.find((m) => m.id === modelId)
  if (!spec) throw new Error(`Unknown speech model ${modelId}`)
  device = await pickDevice()
  const files = new Map<string, { loaded: number; total: number }>()
  asr = (await pipeline('automatic-speech-recognition', spec.repo, {
    device,
    dtype: device === 'webgpu' ? spec.webgpuDtype : spec.wasmDtype,
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (!reportProgress || p.status !== 'progress' || !p.file) return
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      post({ type: 'progress', loaded, total })
    },
  })) as AutomaticSpeechRecognitionPipeline
  loadedModel = modelId
}

async function transcribe(audio: Float32Array): Promise<string> {
  if (!asr) return ''
  // Whisper needs at least ~1 s of input; pad short audio with silence.
  const minLen = SAMPLE_RATE + SAMPLE_RATE / 10
  let input = audio
  if (audio.length < minLen) {
    input = new Float32Array(minLen)
    input.set(audio)
  }
  const secs = audio.length / SAMPLE_RATE
  const out = (await asr(input, { max_new_tokens: Math.max(24, Math.min(128, Math.round(secs * 6 + 16))) })) as { text?: string }
  const words = cleanText(out.text ?? '').split(' ').filter(Boolean)
  return collapseLoops(words).join(' ')
}

// ---------------------------------------------------------------- streaming

interface Config {
  stepMs: number
  windowMs: number
  silenceMs: number
  vadSensitivity: number
}

const ms = (samples: number) => Math.round((samples * 1000) / SAMPLE_RATE)
const samples = (millis: number) => Math.round((millis * SAMPLE_RATE) / 1000)

let running = false
let cfg: Config = { stepMs: 200, windowMs: 5000, silenceMs: 600, vadSensitivity: 0.5 }
let buffer = new SampleBuffer()
let vad = new Vad(0.5, 600)
let vadCursor = 0
let utterance: { id: number; start: number; end: number | null; lastPassEnd: number; lastText: string } | null = null
let nextId = 1
let seq = 0
let speaking = false

/** One step: voice activity on new audio, then maybe a recognition pass. */
async function tick() {
  const bufferEnd = buffer.end()
  const fresh = buffer.slice(vadCursor, bufferEnd)
  const usable = Math.floor(fresh.length / FRAME) * FRAME
  for (let off = 0; off < usable; off += FRAME) {
    const e = vad.process(fresh.subarray(off, off + FRAME), vadCursor + off)
    if (e?.type === 'start') {
      if (!utterance) {
        utterance = { id: nextId++, start: Math.max(0, e.at - samples(250)), end: null, lastPassEnd: 0, lastText: '' }
      } else utterance.end = null
    } else if (e?.type === 'end' && utterance) {
      utterance.end = e.at
    }
  }
  vadCursor += usable
  if (vad.inSpeech !== speaking) {
    speaking = vad.inSpeech
    post({ type: 'speaking', value: speaking })
  }

  const u = utterance
  if (u) {
    const isFinal = u.end !== null
    const end = u.end !== null ? Math.min(u.end + samples(200), bufferEnd) : bufferEnd
    const hasNew = end >= u.lastPassEnd + samples(Math.max(100, cfg.stepMs - 50))
    if (isFinal || hasNew) {
      const from = Math.max(u.start, end - samples(cfg.windowMs))
      const audio = buffer.slice(from, end)
      if (audio.length >= samples(200)) {
        const started = performance.now()
        try {
          const text = await transcribe(audio)
          if (text !== u.lastText || isFinal) {
            const event: TranscriptEvent = {
              utteranceId: u.id,
              seq: ++seq,
              text,
              words: [],
              isFinal,
              windowStartMs: ms(from),
              windowEndMs: ms(end),
              inferenceMs: Math.round(performance.now() - started),
            }
            post({ type: 'transcript', event })
            u.lastText = text
          }
        } catch (e) {
          post({ type: 'error', message: `Recognition failed: ${(e as Error).message}` })
        }
        u.lastPassEnd = end
      }
      if (isFinal && utterance === u) utterance = null
    }
  }
  buffer.trim(samples(cfg.windowMs + 4000))
}

/*
 * Passes are driven by arriving audio rather than timers: browsers throttle
 * timers in background tabs (e.g. while you look at the Meet tab), but audio
 * keeps flowing from the audio thread, so recognition stays live.
 */
let busy = false
let lastPass = 0
let fallback: ReturnType<typeof setTimeout> | undefined

function pump() {
  if (!running || busy) return
  const wait = cfg.stepMs - (performance.now() - lastPass)
  if (wait > 0) {
    clearTimeout(fallback)
    fallback = setTimeout(pump, wait)
    return
  }
  busy = true
  lastPass = performance.now()
  void tick().finally(() => {
    busy = false
    if (running) pump()
  })
}

function onAudio(chunk: Float32Array) {
  if (!running) return
  buffer.push(chunk)
  pump()
}

/** Dev only: play a 16 kHz WAV into the recognizer in real time. */
async function feedDevAudio(url: string) {
  const buf = new DataView(await (await fetch(url)).arrayBuffer())
  let pos = 12
  let audio: Float32Array | null = null
  while (pos + 8 <= buf.byteLength) {
    const id = String.fromCharCode(buf.getUint8(pos), buf.getUint8(pos + 1), buf.getUint8(pos + 2), buf.getUint8(pos + 3))
    const len = buf.getUint32(pos + 4, true)
    if (id === 'data') {
      audio = new Float32Array(len / 2)
      for (let i = 0; i < audio.length; i++) audio[i] = buf.getInt16(pos + 8 + i * 2, true) / 32768
      break
    }
    pos += 8 + len + (len & 1)
  }
  if (!audio) return
  const total = audio.length + SAMPLE_RATE * 2
  const started = performance.now()
  let i = 0
  const step = () => {
    if (!running) return
    const due = Math.min(total, Math.floor(((performance.now() - started) / 1000) * SAMPLE_RATE))
    while (i + FRAME <= due) {
      const part = new Float32Array(FRAME)
      if (i < audio!.length) part.set(audio!.subarray(i, Math.min(i + FRAME, audio!.length)))
      let sq = 0
      for (const v of part) sq += v * v
      post({ type: 'level', rms: Math.sqrt(sq / FRAME) })
      onAudio(part)
      i += FRAME
    }
    if (i + FRAME <= total) setTimeout(step, 20)
  }
  step()
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data
  try {
    if (msg.type === 'preload') {
      setRuntimePath(msg.runtimeUrl)
      await load(msg.modelId, true)
      post({ type: 'loaded', device })
    } else if (msg.type === 'start') {
      setRuntimePath(msg.runtimeUrl)
      cfg = msg.config
      await load(msg.modelId, true)
      // Warm up so the first real pass is fast.
      await transcribe(new Float32Array(SAMPLE_RATE))
      buffer = new SampleBuffer()
      vad = new Vad(cfg.vadSensitivity, cfg.silenceMs)
      vadCursor = 0
      utterance = null
      running = true
      lastPass = 0
      post({ type: 'ready', device })
      if (msg.devAudioUrl) void feedDevAudio(msg.devAudioUrl)
    } else if (msg.type === 'port') {
      // Audio straight from the AudioWorklet, bypassing the page's main thread.
      msg.port.onmessage = (e: MessageEvent<{ samples: Float32Array }>) => onAudio(e.data.samples)
    } else if (msg.type === 'audio') {
      onAudio(msg.samples)
    } else if (msg.type === 'boundary') {
      // Speech before this point belongs to the previous slide.
      if (utterance) {
        utterance.start = buffer.end()
        utterance.lastText = ''
      }
    } else if (msg.type === 'stop') {
      running = false
      clearTimeout(fallback)
    }
  } catch (err) {
    post({ type: 'error', message: (err as Error).message ?? String(err) })
  }
}
