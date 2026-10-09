// The legacy build plus a stream polyfill (in this thread and the worker)
// keeps pdf.js working in WebKit (macOS WKWebView).
import './streamPolyfill'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { vendorUrl } from '../../utils/vendor'

pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./pdfWorker.ts', import.meta.url), { type: 'module' })

const vendor = (path: string) => vendorUrl(`pdfjs/${path}`)

const loadingTasks = new WeakMap<PDFDocumentProxy, pdfjs.PDFDocumentLoadingTask>()

/** Open a PDF from bytes. All auxiliary data is served locally (offline). */
export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({
    data,
    cMapUrl: vendor('cmaps/'),
    cMapPacked: true,
    standardFontDataUrl: vendor('standard_fonts/'),
    wasmUrl: vendor('wasm/'),
    iccUrl: vendor('iccs/'),
  })
  const doc = await task.promise
  loadingTasks.set(doc, task)
  return doc
}

/** Release the document and its worker-side resources. */
export async function closePdf(doc: PDFDocumentProxy | null | undefined): Promise<void> {
  if (!doc) return
  await loadingTasks.get(doc)?.destroy()
  loadingTasks.delete(doc)
}

/** Render a page to a canvas whose width is `width` CSS pixels. */
export async function renderPage(page: PDFPageProxy, width: number): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: width / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  // The print intent renders in one pass instead of on animation frames, so
  // imports keep going when the window is hidden or in the background.
  await page.render({ canvas, viewport, background: 'rgb(255,255,255)', intent: 'print' }).promise
  return canvas
}

interface Fragment {
  str: string
  x: number
  y: number // top, in page units from the top edge
  w: number
  h: number
}

interface Line {
  text: string
  x: number
  y: number
  right: number
  h: number
}

export interface PageText {
  /** Lines in reading order, grouped into blocks. */
  blocks: Line[][]
  pageHeight: number
  pageWidth: number
  chars: number
  /** Share of characters that look like broken font encodings. */
  garbageRatio: number
  hasImages: boolean
}

function isGarbage(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0
  return (c >= 0xe000 && c <= 0xf8ff) || c === 0xfffd || (c < 0x20 && c !== 0x0a && c !== 0x09)
}

/** Extract text from a page and rebuild a natural reading order. */
export async function extractPageText(page: PDFPageProxy): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const frags: Fragment[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    const [, , , d, e, f] = item.transform as number[]
    const h = Math.abs(d) || item.height || 10
    frags.push({ str: item.str, x: e, y: viewport.height - f - h, w: item.width, h })
  }

  // 1. Lines: fragments on the same baseline that are horizontally close.
  frags.sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: Line[] = []
  for (const fr of frags) {
    const line = lines.find(
      (l) => Math.abs(l.y - fr.y) < Math.max(l.h, fr.h) * 0.5 && fr.x - l.right < fr.h * 2.5 && fr.x + fr.w > l.x - fr.h,
    )
    if (line) {
      const gap = fr.x - line.right
      const joiner = gap > fr.h * 0.15 && !line.text.endsWith(' ') && !fr.str.startsWith(' ') ? ' ' : ''
      line.text += joiner + fr.str
      line.right = Math.max(line.right, fr.x + fr.w)
      line.h = Math.max(line.h, fr.h)
    } else {
      lines.push({ text: fr.str, x: fr.x, y: fr.y, right: fr.x + fr.w, h: fr.h })
    }
  }
  for (const l of lines) l.text = l.text.replace(/\s+/g, ' ').trim()

  // 2. Blocks: consecutive lines that overlap horizontally with small gaps.
  lines.sort((a, b) => a.y - b.y || a.x - b.x)
  const blocks: Line[][] = []
  for (const line of lines) {
    const block = blocks.find((b) => {
      const last = b[b.length - 1]
      const gap = line.y - (last.y + last.h)
      const overlap = Math.min(line.right, last.right) - Math.max(line.x, last.x)
      return gap < Math.max(line.h, last.h) * 1.1 && gap > -line.h * 0.5 && overlap > -line.h
    })
    if (block) block.push(line)
    else blocks.push([line])
  }

  // 3. Order blocks top-to-bottom in bands, left-to-right within a band.
  const band = viewport.height * 0.04
  blocks.sort((a, b) => {
    const dy = a[0].y - b[0].y
    if (Math.abs(dy) > band) return dy
    return a[0].x - b[0].x
  })

  const all = lines.map((l) => l.text).join('')
  const garbage = [...all].filter(isGarbage).length

  let hasImages = false
  try {
    const ops = await page.getOperatorList()
    const imageOps = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject])
    hasImages = ops.fnArray.some((fn) => imageOps.has(fn))
  } catch {
    // Operator list is only a hint for OCR.
  }

  return {
    blocks,
    pageHeight: viewport.height,
    pageWidth: viewport.width,
    chars: all.replace(/\s/g, '').length,
    garbageRatio: all.length ? garbage / all.length : 0,
    hasImages,
  }
}

const normLine = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

/**
 * Turn page text into clean slide text: drop page numbers and footers/headers
 * that repeat across most pages, and re-join hyphenated line breaks.
 */
export function cleanPageTexts(pages: PageText[]): string[] {
  const edge = (l: Line, p: PageText) => l.y < p.pageHeight * 0.1 || l.y + l.h > p.pageHeight * 0.9
  const counts = new Map<string, number>()
  for (const p of pages) {
    const seen = new Set<string>()
    for (const b of p.blocks) for (const l of b) if (edge(l, p)) seen.add(normLine(l.text))
    for (const k of seen) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const repeated = (k: string) => pages.length >= 4 && (counts.get(k) ?? 0) >= pages.length * 0.6

  return pages.map((p, pageIndex) => {
    const out: string[] = []
    for (const block of p.blocks) {
      const kept = block.filter((l) => {
        if (!edge(l, p)) return true
        const t = l.text.trim()
        if (/^\d{1,3}$/.test(t) || new RegExp(`^(page|slide)?\\s*${pageIndex + 1}(\\s*(/|of)\\s*\\d+)?$`, 'i').test(t)) return false
        return !repeated(normLine(t))
      })
      if (!kept.length) continue
      let text = ''
      for (const l of kept) {
        if (!text) text = l.text
        else if (/[a-z]-$/i.test(text) && /^[a-z]/.test(l.text)) text = text.slice(0, -1) + l.text
        else text += '\n' + l.text
      }
      out.push(text)
    }
    return out.join('\n\n').trim()
  })
}
