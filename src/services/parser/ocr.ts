import { createWorker, type Worker } from 'tesseract.js'
import { vendorUrl } from '../../utils/vendor'

/*
 * Offline OCR with Tesseract (WASM). Worker, core and the English model are
 * bundled under /vendor/ocr, so nothing is fetched from the network.
 */

const vendor = (path: string) => vendorUrl(`ocr/${path}`)

let workerPromise: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: vendor('worker.min.js'),
      corePath: vendor(''),
      langPath: vendor('lang'),
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: false,
    }).catch((e) => {
      workerPromise = null
      throw e
    })
  }
  return workerPromise
}

export interface OcrResult {
  text: string
  /** 0..1 */
  confidence: number
}

/** Recognize text in a rendered slide. */
export async function ocrCanvas(canvas: HTMLCanvasElement): Promise<OcrResult> {
  const worker = await getWorker()
  const { data } = await worker.recognize(canvas)
  const text = data.text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    // Lines of stray symbols are layout noise, not text.
    .filter((l) => l.length > 1 && /[\p{L}\p{N}]{2,}/u.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    // Classic I/l confusion: slide decks say "AI" far more often than "Al".
    .replace(/\bAl\b(?!\.)/g, 'AI')
    .trim()
  return { text, confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)) }
}

/** Load an image file (asset URL) into a canvas, for re-running OCR later. */
export async function canvasFromUrl(url: string): Promise<HTMLCanvasElement> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  return canvas
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null)
    workerPromise = null
    await w?.terminate()
  }
}
