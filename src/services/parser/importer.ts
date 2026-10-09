import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Extraction, Presentation, Slide, SlideRenderer } from '../../types'
import { newId } from '../../utils/id'
import { importSource, readFileBytes, savePresentation, writeAsset } from '../storage/projects'
import { platform } from '../../platform'
import { canvasFromUrl, ocrCanvas } from './ocr'
import { cleanPageTexts, closePdf, extractPageText, openPdf, renderPage, type PageText } from './pdf'
import { parsePptx, type PptxDocument } from './pptx'
import { renderPptxSlide, renderTextSlide } from './render'
import { makeSlide } from './slides'
import { sourceTypeOf } from './formats'

export const SLIDE_WIDTH = 2048
export const THUMB_WIDTH = 400

export type ImportStage = 'copying' | 'converting' | 'rendering' | 'ocr' | 'saving' | 'done'

export interface ImportProgress {
  stage: ImportStage
  current: number
  total: number
  message: string
  slide?: Slide
}

type Progress = (p: ImportProgress) => void

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path
const dirName = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')))
const stripExt = (name: string) => name.replace(/\.[^.]+$/, '')

// ------------------------------------------------------------ text helpers

// ------------------------------------------------------------ images

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('could not encode slide image'))
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject)
      },
      'image/jpeg',
      quality,
    )
  })
}

function scaled(canvas: HTMLCanvasElement, width: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = width
  out.height = Math.round((canvas.height / canvas.width) * width)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

async function storeImages(projectId: string, slideId: string, canvas: HTMLCanvasElement) {
  const image = await writeAsset(projectId, `slides/${slideId}.jpg`, await canvasToJpeg(canvas, 0.88))
  const thumbnail = await writeAsset(projectId, `thumbs/${slideId}.jpg`, await canvasToJpeg(scaled(canvas, THUMB_WIDTH), 0.8))
  return { image, thumbnail }
}

/** Fraction of pixels that differ from the dominant background colour. */
function inkRatio(canvas: HTMLCanvasElement): number {
  const small = scaled(canvas, 96)
  const { data } = small.getContext('2d')!.getImageData(0, 0, small.width, small.height)
  const counts = new Map<number, number>()
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const bgCount = Math.max(...counts.values())
  return 1 - bgCount / (data.length / 4)
}

// ------------------------------------------------------------ OCR decision

async function maybeOcr(
  canvas: HTMLCanvasElement,
  text: string,
  base: Extraction,
  hint: { hasImages: boolean; garbageRatio?: number },
): Promise<{ text: string; extraction: Extraction }> {
  const chars = text.replace(/\s/g, '').length
  const garbled = (hint.garbageRatio ?? 0) > 0.3
  const needsOcr = garbled || (chars < 20 && (hint.hasImages || inkRatio(canvas) > 0.03))
  if (!needsOcr) return { text, extraction: base }
  try {
    const ocr = await ocrCanvas(canvas)
    if (!ocr.text) return { text, extraction: chars ? base : { method: 'none', confidence: 0, note: 'No readable text found' } }
    if (!garbled && chars > 0 && ocr.text.length <= text.length) return { text, extraction: base }
    return {
      text: ocr.text,
      extraction: { method: 'ocr', confidence: ocr.confidence, note: garbled ? 'Text layer was unreadable; used OCR' : 'Text recognized from the slide image' },
    }
  } catch (e) {
    console.warn('OCR failed', e)
    return { text, extraction: { ...base, note: 'OCR unavailable' } }
  }
}

// ------------------------------------------------------------ PDF

async function importPdf(ctx: ImportContext): Promise<{ slides: Slide[]; aspect: number; renderer: SlideRenderer }> {
  const pdf = await openPdf(await readFileBytes(ctx.sourcePath))
  try {
    const first = await pdf.getPage(1)
    const vp = first.getViewport({ scale: 1 })
    const aspect = vp.width / vp.height
    const total = pdf.numPages
    const pages: { id: string; image: string; thumbnail: string; text: PageText; ink: number }[] = []

    // Pass 1: render every page and read its text layer. Slides appear in
    // the UI as they are rendered (with provisional text).
    for (let i = 0; i < total; i++) {
      ctx.onProgress({ stage: 'rendering', current: i + 1, total, message: `Rendering slide ${i + 1} of ${total}` })
      const page = await pdf.getPage(i + 1)
      const canvas = await renderPage(page, SLIDE_WIDTH)
      const id = newId()
      const stored = await storeImages(ctx.id, id, canvas)
      const text = await extractPageText(page)
      pages.push({ id, ...stored, text, ink: inkRatio(canvas) })
      page.cleanup()
      const provisional = text.blocks.map((b) => b.map((l) => l.text).join('\n')).join('\n\n')
      ctx.onProgress({
        stage: 'rendering',
        current: i + 1,
        total,
        message: `Rendering slide ${i + 1} of ${total}`,
        slide: makeSlide(i, { id, ...stored, extractedText: provisional, extraction: { method: 'pdf-text', confidence: 0.97 } }),
      })
    }

    // Pass 2: remove repeated headers/footers and page numbers, then OCR the
    // slides whose real content turned out to be an image.
    const cleaned = cleanPageTexts(pages.map((p) => p.text))
    const slides: Slide[] = []
    for (let i = 0; i < total; i++) {
      const { text: t, ink } = pages[i]
      let text = cleaned[i]
      let extraction: Extraction = text
        ? { method: 'pdf-text', confidence: Math.max(0.5, 0.97 - t.garbageRatio * 2) }
        : { method: 'none', confidence: 1, note: 'No text on this slide' }
      const chars = text.replace(/\s/g, '').length
      if (t.garbageRatio > 0.3 || (chars < 20 && (t.hasImages || ink > 0.03))) {
        ctx.onProgress({ stage: 'ocr', current: i + 1, total, message: `Reading text from image on slide ${i + 1}` })
        const canvas = await renderPage(await pdf.getPage(i + 1), 1600)
        ;({ text, extraction } = await maybeOcr(canvas, text, extraction, t))
      }
      slides.push(makeSlide(i, { id: pages[i].id, image: pages[i].image, thumbnail: pages[i].thumbnail, extractedText: text, extraction }))
    }
    return { slides, aspect, renderer: 'pdf' }
  } finally {
    await closePdf(pdf)
  }
}

// ------------------------------------------------------------ importers

interface ImportContext {
  id: string
  sourcePath: string
  onProgress: Progress
}

/** Convert with a local LibreOffice when available (exact slide rendering). */
async function convertWithOffice(ctx: ImportContext): Promise<PDFDocumentProxy | null> {
  const soffice = await platform.docs.officeConverterPath().catch(() => null)
  if (!soffice) return null
  ctx.onProgress({ stage: 'converting', current: 0, total: 1, message: 'Rendering slides with LibreOffice…' })
  try {
    const pdfPath = await platform.docs.convertToPdf(ctx.sourcePath, dirName(ctx.sourcePath) + '/converted')
    return await openPdf(await readFileBytes(pdfPath))
  } catch (e) {
    console.warn('office conversion failed, using built-in renderer', e)
    return null
  }
}

async function importPptx(ctx: ImportContext): Promise<{ slides: Slide[]; aspect: number; renderer: SlideRenderer }> {
  const doc: PptxDocument = await parsePptx(await readFileBytes(ctx.sourcePath))
  const aspect = doc.width / doc.height
  const total = doc.slides.length
  const office = await convertWithOffice(ctx)

  // LibreOffice skips hidden slides; map PDF pages onto the slides they belong to.
  let pageFor: (i: number) => number | null = () => null
  if (office) {
    const visible = doc.slides.map((s, i) => (s.hidden ? -1 : i)).filter((i) => i >= 0)
    if (office.numPages === total) pageFor = (i) => i
    else if (office.numPages === visible.length) pageFor = (i) => (visible.indexOf(i) >= 0 ? visible.indexOf(i) : null)
  }

  const imageCache = new Map<string, ImageBitmap | null>()
  const slides: Slide[] = []
  try {
    for (const [i, s] of doc.slides.entries()) {
      ctx.onProgress({ stage: 'rendering', current: i + 1, total, message: `Rendering slide ${i + 1} of ${total}` })
      const pageIndex = office ? pageFor(i) : null
      const canvas =
        office && pageIndex !== null
          ? await renderPage(await office.getPage(pageIndex + 1), SLIDE_WIDTH)
          : await renderPptxSlide(doc, s, SLIDE_WIDTH, imageCache)
      const slideId = newId()
      const images = await storeImages(ctx.id, slideId, canvas)
      let text = s.text
      let extraction: Extraction = text
        ? { method: 'pptx-xml', confidence: 0.98 }
        : { method: 'none', confidence: 1, note: 'No text on this slide' }
      const hasImages = s.shapes.some((sh) => sh.kind === 'picture') || !!s.background.image
      if (text.replace(/\s/g, '').length < 20 && hasImages) {
        ctx.onProgress({ stage: 'ocr', current: i + 1, total, message: `Reading text from image on slide ${i + 1}` })
        ;({ text, extraction } = await maybeOcr(scaled(canvas, 1600), text, extraction, { hasImages }))
      }
      const slide = makeSlide(i, { id: slideId, ...images, extractedText: text, extraction, notes: s.notes })
      ctx.onProgress({ stage: 'rendering', current: i + 1, total, message: `Prepared slide ${i + 1}`, slide })
      slides.push(slide)
    }
  } finally {
    imageCache.forEach((b) => b?.close())
    await closePdf(office)
  }
  return { slides, aspect, renderer: office ? 'office-pdf' : 'pptx-preview' }
}

async function importPpt(ctx: ImportContext): Promise<{ slides: Slide[]; aspect: number; renderer: SlideRenderer }> {
  const parsed = await platform.docs.parsePptLegacy(ctx.sourcePath)
  const office = await convertWithOffice(ctx)
  const usable = office && office.numPages === parsed.length ? office : null
  let aspect = 4 / 3
  if (usable) {
    const vp = (await usable.getPage(1)).getViewport({ scale: 1 })
    aspect = vp.width / vp.height
  }
  const total = parsed.length
  const slides: Slide[] = []
  try {
    for (const [i, s] of parsed.entries()) {
      ctx.onProgress({ stage: 'rendering', current: i + 1, total, message: `Rendering slide ${i + 1} of ${total}` })
      const text = s.texts.join('\n').trim()
      const canvas = usable
        ? await renderPage(await usable.getPage(i + 1), SLIDE_WIDTH)
        : await renderTextSlide(text, SLIDE_WIDTH, aspect, { slideNumber: i + 1 })
      const slideId = newId()
      const images = await storeImages(ctx.id, slideId, canvas)
      const extraction: Extraction = text
        ? { method: 'ppt-binary', confidence: 0.9 }
        : { method: 'none', confidence: 1, note: 'No text on this slide' }
      const slide = makeSlide(i, { id: slideId, ...images, extractedText: text, extraction, notes: s.notes })
      ctx.onProgress({ stage: 'rendering', current: i + 1, total, message: `Prepared slide ${i + 1}`, slide })
      slides.push(slide)
    }
  } finally {
    await closePdf(office)
  }
  return { slides, aspect, renderer: usable ? 'office-pdf' : 'text' }
}

/** Import a PDF / PPTX / PPT file into a new local presentation. */
export async function importPresentation(filePath: string, onProgress: Progress): Promise<Presentation> {
  const type = sourceTypeOf(filePath)
  if (!type || type === 'blank') throw new Error('Unsupported file. Choose a PDF, PPTX or PPT presentation.')
  const id = newId()
  onProgress({ stage: 'copying', current: 0, total: 1, message: 'Copying presentation…' })
  const sourcePath = await importSource(id, filePath)
  const ctx: ImportContext = { id, sourcePath, onProgress }

  const { slides, aspect, renderer } =
    type === 'pdf' ? await importPdf(ctx) : type === 'pptx' ? await importPptx(ctx) : await importPpt(ctx)

  onProgress({ stage: 'saving', current: slides.length, total: slides.length, message: 'Saving…' })
  const now = Date.now()
  const presentation: Presentation = {
    version: 1,
    id,
    name: stripExt(fileName(filePath)),
    filePath,
    sourcePath,
    sourceType: type,
    renderer,
    aspectRatio: aspect,
    createdAt: now,
    updatedAt: now,
    slides,
  }
  await savePresentation(presentation, false)
  onProgress({ stage: 'done', current: slides.length, total: slides.length, message: 'Ready' })
  return presentation
}

// ------------------------------------------------------------ re-extraction

/**
 * Re-run text extraction for one slide ("Auto Extract Text"). `ocr` forces
 * recognition from the slide image; `auto` re-reads the source document and
 * falls back to OCR when the slide has no usable text.
 */
export async function reextractSlide(
  p: Presentation,
  index: number,
  mode: 'auto' | 'ocr',
  imageUrl: string,
): Promise<{ text: string; extraction: Extraction }> {
  const slide = p.slides[index]
  const ocr = async () => {
    if (!imageUrl) return { text: '', extraction: { method: 'none', confidence: 0, note: 'No slide image to read' } as Extraction }
    const res = await ocrCanvas(scaled(await canvasFromUrl(imageUrl), 1600))
    return {
      text: res.text,
      extraction: { method: 'ocr', confidence: res.confidence, note: 'Text recognized from the slide image' } as Extraction,
    }
  }
  if (mode === 'ocr' || !p.sourcePath) return ocr()

  let text = ''
  let extraction: Extraction = { method: 'none', confidence: 1 }
  if (p.sourceType === 'pdf') {
    const pdf = await openPdf(await readFileBytes(p.sourcePath))
    try {
      const t = await extractPageText(await pdf.getPage(index + 1))
      text = cleanPageTexts([t])[0]
      extraction = { method: 'pdf-text', confidence: Math.max(0.5, 0.97 - t.garbageRatio * 2) }
      if (t.garbageRatio > 0.3) return ocr()
    } finally {
      await closePdf(pdf)
    }
  } else if (p.sourceType === 'pptx') {
    const doc = await parsePptx(await readFileBytes(p.sourcePath))
    text = doc.slides[index]?.text ?? ''
    extraction = { method: 'pptx-xml', confidence: 0.98 }
  } else if (p.sourceType === 'ppt') {
    const parsed = await platform.docs.parsePptLegacy(p.sourcePath)
    text = parsed[index]?.texts.join('\n') ?? ''
    extraction = { method: 'ppt-binary', confidence: 0.9 }
  }
  if (text.replace(/\s/g, '').length < 20 && slide.image) {
    const viaOcr = await ocr()
    if (viaOcr.text.length > text.length) return viaOcr
  }
  return { text, extraction: text ? extraction : { method: 'none', confidence: 1, note: 'No text on this slide' } }
}
