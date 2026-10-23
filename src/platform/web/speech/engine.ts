/*
 * Browser speech engine: microphone (AudioWorklet, resampled to 16 kHz) ->
 * recognizer worker (Whisper on WebGPU / WASM) -> the same transcript, level
 * and status events the desktop engine emits.
 */
import type { InputDevice, ModelInfo, Settings, TranscriptEvent } from '../../../types'
import type { DownloadEvent, LevelEvent, StartInfo, StatusEvent } from '../../../services/speech/speechService'
import { vendorUrl } from '../../../utils/vendor'
import { modelFiles, WEB_MODELS, type WorkerIn, type WorkerOut } from './protocol'

type Listener<T> = (value: T) => void
const unlisten = (set: Set<unknown>, fn: unknown) => () => void set.delete(fn)

// AudioWorklet: downmix, low-pass and resample to 16 kHz; post 20 ms chunks.
export const WORKLET = `
class ReflexCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000;
    this.pos = 0; this.prev = 0;
    let taps = [1];
    if (this.step > 1) {
      const n = 33, cutoff = 7200 / sampleRate, mid = (n - 1) / 2;
      taps = [];
      for (let i = 0; i < n; i++) {
        const x = i - mid;
        const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
        taps.push(sinc * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1))));
      }
      const sum = taps.reduce((a, b) => a + b, 0);
      taps = taps.map((t) => t / sum);
    }
    this.taps = taps;
    this.hist = new Float32Array(taps.length - 1);
    this.out = new Float32Array(320); this.outLen = 0;
    this.sq = 0; this.count = 0;
    this.sink = null;
    this.port.onmessage = (e) => { if (e.data && e.data.type === 'sink') this.sink = e.data.port; };
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0]) return true;
    const len = input[0].length, chans = input.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < chans; c++) { const ch = input[c]; for (let i = 0; i < len; i++) mono[i] += ch[i] / chans; }
    for (let i = 0; i < len; i++) { this.sq += mono[i] * mono[i]; }
    this.count += len;
    const n = this.taps.length;
    const ext = new Float32Array(n - 1 + len); ext.set(this.hist); ext.set(mono, n - 1);
    const f = new Float32Array(len);
    for (let i = 0; i < len; i++) { let acc = 0; for (let k = 0; k < n; k++) acc += ext[i + k] * this.taps[k]; f[i] = acc; }
    this.hist = ext.slice(ext.length - (n - 1));
    const last = len - 1;
    while (this.pos <= last) {
      const i = Math.floor(this.pos), frac = this.pos - i;
      const a = i < 0 ? this.prev : f[i];
      const b = i + 1 <= last ? f[i + 1] : a;
      this.out[this.outLen++] = a + (b - a) * frac;
      if (this.outLen === this.out.length) {
        const rms = Math.sqrt(this.sq / Math.max(1, this.count));
        if (this.sink) this.sink.postMessage({ samples: this.out }, [this.out.buffer]);
        this.port.postMessage({ rms });
        this.out = new Float32Array(320); this.outLen = 0; this.sq = 0; this.count = 0;
      }
      this.pos += this.step;
    }
    this.pos -= len; this.prev = f[last];
    return true;
  }
}
registerProcessor('reflex-capture', ReflexCapture);
`

export const levelOf = (rms: number) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(rms, 1e-6)) + 60) / 60))

/** Dev only: a WAV file (16-bit, 16 kHz) standing in for the microphone. */
function devAudioUrl(): string | null {
  if (!import.meta.env.DEV) return null
  try {
    return sessionStorage.getItem('reflex.devAudio')
  } catch {
    return null
  }
}

const CACHE = 'transformers-cache'

const hasWebGpu = () => 'gpu' in navigator

/** Models whose files (for this browser's backend) are already cached. */
export async function cachedRepos(): Promise<Set<string>> {
  const out = new Set<string>()
  try {
    const cache = await caches.open(CACHE)
    const urls = (await cache.keys()).map((r) => r.url)
    for (const m of WEB_MODELS) {
      const needed = modelFiles(hasWebGpu() ? m.webgpuDtype : m.wasmDtype)
      if (needed.every((f) => urls.some((u) => u.includes(`/${m.repo}/`) && u.endsWith(f)))) out.add(m.id)
    }
  } catch {
    // Cache Storage unavailable (e.g. private mode): models re-download.
  }
  return out
}

class WebSpeechEngine {
  private worker: Worker | null = null
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private downloads = new Map<string, Worker>()
  private transcriptL = new Set<Listener<TranscriptEvent>>()
  private levelL = new Set<Listener<LevelEvent>>()
  private statusL = new Set<Listener<StatusEvent>>()
  private downloadL = new Set<Listener<DownloadEvent>>()
  private speaking = false
  private levelTick = 0

  private emitStatus(state: StatusEvent['state'], message: string) {
    this.statusL.forEach((l) => l({ state, message }))
  }

  private newWorker(): Worker {
    return new Worker(new URL('./recognizer.worker.ts', import.meta.url), { type: 'module' })
  }

  async start(cfg: Settings['speech']): Promise<StartInfo> {
    await this.stop()
    if (!(await cachedRepos()).has(cfg.modelId)) throw new Error(`MODEL_MISSING:${cfg.modelId}`)
    const spec = WEB_MODELS.find((m) => m.id === cfg.modelId)!

    // Microphone first, so a permission problem is reported immediately.
    let device = 'Microphone'
    const dev = devAudioUrl()
    if (!dev) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: cfg.deviceId ? { exact: cfg.deviceId } : undefined,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        device = this.stream.getAudioTracks()[0]?.label || device
      } catch (e) {
        const msg = (e as Error).name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in the browser’s site settings.' : (e as Error).message
        this.emitStatus('error', msg)
        throw new Error(`Microphone unavailable: ${msg}`)
      }
    } else {
      device = `File: ${dev.split('/').pop()}`
    }

    this.emitStatus('loading', 'Loading speech model…')
    const worker = this.newWorker()
    this.worker = worker
    const ready = new Promise<string>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data
        if (m.type === 'ready') resolve(m.device)
        else if (m.type === 'error') {
          reject(new Error(m.message))
          this.emitStatus('error', m.message)
        } else if (m.type === 'transcript') this.transcriptL.forEach((l) => l(m.event))
        else if (m.type === 'speaking') this.speaking = m.value
        else if (m.type === 'level') this.emitLevel(m.rms)
      }
      worker.onerror = (e) => reject(new Error(e.message || 'speech worker failed'))
    })
    const msg: WorkerIn = {
      type: 'start',
      modelId: cfg.modelId,
      config: { stepMs: Math.max(150, cfg.stepMs), windowMs: cfg.windowMs, silenceMs: cfg.silenceMs, vadSensitivity: cfg.vadSensitivity },
      devAudioUrl: dev ? new URL(dev, window.location.href).href : null,
      runtimeUrl: vendorUrl('ort/'),
    }
    worker.postMessage(msg)
    const backend = await ready
    if (this.worker !== worker) throw new Error('SUPERSEDED')

    if (!dev) await this.captureMic(worker)
    this.emitStatus('listening', 'Listening')
    return { device, model: `${spec.label} (${backend === 'webgpu' ? 'WebGPU' : 'CPU'})` }
  }

  private emitLevel(rms: number) {
    if (++this.levelTick % 2 === 0) this.levelL.forEach((l) => l({ level: levelOf(rms), speaking: this.speaking }))
  }

  private async captureMic(worker: Worker) {
    const ctx = new AudioContext()
    this.ctx = ctx
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const source = ctx.createMediaStreamSource(this.stream!)
    const node = new AudioWorkletNode(ctx, 'reflex-capture')
    // Audio thread -> recognizer worker directly; the page only gets levels.
    const channel = new MessageChannel()
    worker.postMessage({ type: 'port', port: channel.port2 } satisfies WorkerIn, [channel.port2])
    node.port.postMessage({ type: 'sink', port: channel.port1 }, [channel.port1])
    node.port.onmessage = (e: MessageEvent<{ rms: number }>) => this.emitLevel(e.data.rms)
    // A silent sink keeps the graph pulling audio without playing it back.
    const sink = ctx.createGain()
    sink.gain.value = 0
    source.connect(node).connect(sink).connect(ctx.destination)
    if (ctx.state === 'suspended') await ctx.resume()
  }

  async stop() {
    this.worker?.postMessage({ type: 'stop' } satisfies WorkerIn)
    this.worker?.terminate()
    this.worker = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    await this.ctx?.close().catch(() => {})
    this.ctx = null
    this.emitStatus('stopped', 'Stopped')
  }

  /** Script biasing is a desktop (whisper.cpp) feature. */
  setPrompt(_prompt: string) {
    void _prompt
    return Promise.resolve()
  }

  /** Speech heard so far belongs to the previous slide. */
  boundary() {
    this.worker?.postMessage({ type: 'boundary' } satisfies WorkerIn)
  }

  isRunning() {
    return Promise.resolve(!!this.worker)
  }

  async listDevices(): Promise<InputDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, name: d.label || `Microphone ${i + 1}`, isDefault: false }))
  }

  async listModels(): Promise<ModelInfo[]> {
    const installed = await cachedRepos()
    const gpu = hasWebGpu()
    return WEB_MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      file: m.repo,
      sizeMb: gpu ? m.webgpuMb : m.wasmMb,
      englishOnly: true,
      description: m.description,
      installed: installed.has(m.id),
      custom: false,
      path: '',
    }))
  }

  async downloadModel(id: string) {
    if (this.downloads.has(id)) return
    const worker = this.newWorker()
    this.downloads.set(id, worker)
    const finish = (error: string | null) => {
      this.downloadL.forEach((l) => l({ id, downloaded: 0, total: 0, done: true, error }))
      worker.terminate()
      this.downloads.delete(id)
    }
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data
      if (m.type === 'progress') this.downloadL.forEach((l) => l({ id, downloaded: m.loaded, total: m.total, done: false, error: null }))
      else if (m.type === 'loaded') finish(null)
      else if (m.type === 'error') finish(m.message)
    }
    worker.postMessage({ type: 'preload', modelId: id, runtimeUrl: vendorUrl('ort/') } satisfies WorkerIn)
  }

  async cancelDownload(id: string) {
    const w = this.downloads.get(id)
    if (!w) return
    w.terminate()
    this.downloads.delete(id)
    this.downloadL.forEach((l) => l({ id, downloaded: 0, total: 0, done: true, error: 'download cancelled' }))
  }

  async deleteModel(id: string) {
    const spec = WEB_MODELS.find((m) => m.id === id)
    if (!spec) return
    const cache = await caches.open(CACHE)
    for (const req of await cache.keys()) if (req.url.includes(`/${spec.repo}/`)) await cache.delete(req)
  }

  onTranscript(cb: Listener<TranscriptEvent>) {
    this.transcriptL.add(cb)
    return Promise.resolve(unlisten(this.transcriptL, cb))
  }
  onLevel(cb: Listener<LevelEvent>) {
    this.levelL.add(cb)
    return Promise.resolve(unlisten(this.levelL, cb))
  }
  onStatus(cb: Listener<StatusEvent>) {
    this.statusL.add(cb)
    return Promise.resolve(unlisten(this.statusL, cb))
  }
  onDownload(cb: Listener<DownloadEvent>) {
    this.downloadL.add(cb)
    return Promise.resolve(unlisten(this.downloadL, cb))
  }
}

export const webSpeech = new WebSpeechEngine()
