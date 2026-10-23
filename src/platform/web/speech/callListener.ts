/*
 * SI copilot, browser: listens to the *call* rather than the microphone. The
 * presenter shares the tab their meeting runs in (with "Also share tab
 * audio"); that audio goes through the same AudioWorklet and Whisper worker as
 * the teleprompter, so it is transcribed on this device and never uploaded.
 */
import type { TranscriptEvent } from '../../../types'
import { vendorUrl } from '../../../utils/vendor'
import { cachedRepos, WORKLET } from './engine'
import type { WorkerIn, WorkerOut } from './protocol'

export type CallListenState = 'idle' | 'starting' | 'listening' | 'error'

// Questions run longer than script phrases: re-transcribe whole utterances
// (Whisper's 30 s limit) less often, and wait a little longer for the pause.
const CALL_STREAM = { stepMs: 1200, windowMs: 26000, silenceMs: 900, vadSensitivity: 0.5 }

/** Dev only: `?devCallAudio=/path.wav` replays a 16 kHz WAV as the call. */
function devCallAudio(): string | null {
  if (!import.meta.env.DEV) return null
  try {
    return sessionStorage.getItem('reflex.devCallAudio')
  } catch {
    return null
  }
}

export class CallListener {
  private worker: Worker | null = null
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  onTranscript: (e: TranscriptEvent) => void = () => {}
  /** The share was stopped from the browser's "Stop sharing" bar. */
  onEnded: () => void = () => {}

  get active() {
    return !!this.worker
  }

  async start(modelId: string): Promise<void> {
    await this.stop()
    if (!(await cachedRepos()).has(modelId)) {
      throw new Error('Download the speech model first (Settings → Speech), then try again.')
    }
    const dev = devCallAudio()
    if (!dev) {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Listening to a call needs Chrome or Edge on a computer.')
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          // Chrome hints: offer tabs first, include system audio where the OS allows it.
          preferCurrentTab: false,
          selfBrowserSurface: 'exclude',
          systemAudio: 'include',
          surfaceSwitching: 'include',
        } as DisplayMediaStreamOptions)
      } catch (e) {
        const name = (e as Error).name
        if (name === 'NotAllowedError' || name === 'AbortError') throw new Error('Sharing was cancelled.')
        throw e
      }
      if (!stream.getAudioTracks().length) {
        stream.getTracks().forEach((t) => t.stop())
        throw new Error('No call audio was shared. Choose the tab your meeting is in and turn on “Also share tab audio”.')
      }
      this.stream = stream
      stream.getAudioTracks()[0].addEventListener('ended', () => {
        void this.stop()
        this.onEnded()
      })
    }

    const worker = new Worker(new URL('./recognizer.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    const ready = new Promise<void>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data
        if (m.type === 'ready') resolve()
        else if (m.type === 'error') reject(new Error(m.message))
        else if (m.type === 'transcript') this.onTranscript(m.event)
      }
      worker.onerror = (e) => reject(new Error(e.message || 'speech worker failed'))
    })
    worker.postMessage({
      type: 'start',
      modelId,
      config: CALL_STREAM,
      devAudioUrl: dev ? new URL(dev, window.location.href).href : null,
      runtimeUrl: vendorUrl('ort/'),
    } satisfies WorkerIn)
    try {
      await ready
    } catch (e) {
      await this.stop()
      throw e
    }
    if (this.worker !== worker) throw new Error('SUPERSEDED')
    if (this.stream) await this.capture(worker, this.stream)
  }

  private async capture(worker: Worker, stream: MediaStream) {
    const ctx = new AudioContext()
    this.ctx = ctx
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }))
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
    const node = new AudioWorkletNode(ctx, 'reflex-capture')
    const channel = new MessageChannel()
    worker.postMessage({ type: 'port', port: channel.port2 } satisfies WorkerIn, [channel.port2])
    node.port.postMessage({ type: 'sink', port: channel.port1 }, [channel.port1])
    // Silent sink: keeps the graph running without echoing the call.
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
  }
}
