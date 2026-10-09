import type { PptxDocument, PptxParagraph, PptxShape, PptxSlide } from './pptx'
import { EMU_PER_PT } from './pptx'

const FONT_STACK = '"Inter Variable", "Helvetica Neue", Helvetica, Arial, sans-serif'

function luminance(hex: string | undefined): number {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return 1
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

interface Styled {
  text: string
  font: string
  color: string
  size: number
}

/** Greedy word wrap of styled runs; returns lines of positioned pieces. */
function layoutParagraph(
  ctx: CanvasRenderingContext2D,
  p: PptxParagraph,
  maxWidth: number,
  basePx: number,
  scale: number,
  defaultColor: string,
) {
  const pieces: Styled[] = []
  for (const r of p.runs) {
    const size = r.size ? r.size * EMU_PER_PT * scale : basePx
    const font = `${r.italic ? 'italic ' : ''}${r.bold ? 650 : 420} ${size}px ${FONT_STACK}`
    for (const part of r.text.split(/(\s+|\n)/)) {
      if (part) pieces.push({ text: part, font, color: r.color ?? defaultColor, size })
    }
  }
  const lines: { items: (Styled & { x: number; w: number })[]; width: number; height: number }[] = []
  let line: (Styled & { x: number; w: number })[] = []
  let x = 0
  let height = basePx
  const flush = () => {
    while (line.length && /^\s+$/.test(line[line.length - 1].text)) {
      x -= line[line.length - 1].w
      line.pop()
    }
    lines.push({ items: line, width: x, height: height * 1.18 })
    line = []
    x = 0
    height = basePx
  }
  for (const piece of pieces) {
    if (piece.text === '\n') {
      flush()
      continue
    }
    ctx.font = piece.font
    const w = ctx.measureText(piece.text).width
    if (x + w > maxWidth && line.length && !/^\s+$/.test(piece.text)) flush()
    if (!line.length && /^\s+$/.test(piece.text)) continue
    line.push({ ...piece, x, w })
    x += w
    height = Math.max(height, piece.size)
  }
  flush()
  return lines
}

function drawTextBox(
  ctx: CanvasRenderingContext2D,
  paragraphs: PptxParagraph[],
  box: { x: number; y: number; w: number; h: number },
  basePt: number,
  fontScale: number,
  anchor: PptxShape['anchor'],
  scale: number,
  defaultColor: string,
) {
  const insetX = 91440 * scale
  const insetY = 45720 * scale
  const innerW = Math.max(10, box.w - insetX * 2)
  const blocks = paragraphs.map((p) => {
    const indent = p.bullet ? (0.9 + p.level * 0.9) * basePt * EMU_PER_PT * scale : p.level * 0.6 * basePt * EMU_PER_PT * scale
    const basePx = basePt * EMU_PER_PT * scale * fontScale
    const scaled = { ...p, runs: p.runs.map((r) => ({ ...r, size: r.size ? r.size * fontScale : undefined })) }
    return { p, indent, basePx, lines: layoutParagraph(ctx, scaled, innerW - indent, basePx, scale, defaultColor) }
  })
  const total = blocks.reduce((h, b) => h + b.lines.reduce((s, l) => s + l.height, 0) + b.basePx * 0.25, 0)
  let y = box.y + insetY
  if (anchor === 'ctr') y = box.y + (box.h - total) / 2
  if (anchor === 'b') y = box.y + box.h - insetY - total

  ctx.textBaseline = 'alphabetic'
  for (const b of blocks) {
    b.lines.forEach((line, li) => {
      const left = box.x + insetX + b.indent
      let start = left
      if (b.p.align === 'ctr') start = box.x + insetX + b.indent + (innerW - b.indent - line.width) / 2
      if (b.p.align === 'r') start = box.x + box.w - insetX - line.width
      const baseline = y + line.height * 0.82
      if (li === 0 && b.p.bullet && line.items.length) {
        ctx.font = `420 ${b.basePx}px ${FONT_STACK}`
        ctx.fillStyle = line.items[0].color
        ctx.fillText('•', left - b.basePx * 0.8, baseline)
      }
      for (const item of line.items) {
        ctx.font = item.font
        ctx.fillStyle = item.color
        ctx.fillText(item.text, start + item.x, baseline)
      }
      y += line.height
    })
    y += b.basePx * 0.25
  }
}

async function loadImage(doc: PptxDocument, target: string, cache: Map<string, ImageBitmap | null>) {
  if (cache.has(target)) return cache.get(target) ?? null
  let bitmap: ImageBitmap | null = null
  try {
    const entry = doc.zip.file(target)
    if (entry && /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(target)) {
      const blob = await entry.async('blob')
      const typed = target.toLowerCase().endsWith('.svg') ? new Blob([blob], { type: 'image/svg+xml' }) : blob
      bitmap = await createImageBitmap(typed)
    }
  } catch {
    bitmap = null // EMF/WMF/TIFF etc. are not drawable in the webview
  }
  cache.set(target, bitmap)
  return bitmap
}

/** Draw a parsed PPTX slide into a canvas `width` pixels wide. */
export async function renderPptxSlide(
  doc: PptxDocument,
  slide: PptxSlide,
  width: number,
  imageCache: Map<string, ImageBitmap | null> = new Map(),
): Promise<HTMLCanvasElement> {
  const scale = width / doc.width
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width)
  canvas.height = Math.round(doc.height * scale)
  const ctx = canvas.getContext('2d')!
  await document.fonts?.ready

  const bg = slide.background.color ?? '#FFFFFF'
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (slide.background.image) {
    const img = await loadImage(doc, slide.background.image, imageCache)
    if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  }
  const darkBg = luminance(bg) < 0.45
  const defaultColor = darkBg ? '#FFFFFF' : '#111111'

  for (const s of slide.shapes) {
    const box = { x: s.x * scale, y: s.y * scale, w: s.w * scale, h: s.h * scale }
    if (s.kind === 'picture' && s.image) {
      const img = await loadImage(doc, s.image, imageCache)
      if (img) ctx.drawImage(img, box.x, box.y, box.w, box.h)
      else {
        ctx.fillStyle = darkBg ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'
        ctx.fillRect(box.x, box.y, box.w, box.h)
      }
      continue
    }
    if (s.fill) {
      ctx.fillStyle = s.fill
      if (s.rounded) {
        ctx.beginPath()
        ctx.roundRect(box.x, box.y, box.w, box.h, Math.min(box.w, box.h) * 0.12)
        ctx.fill()
      } else ctx.fillRect(box.x, box.y, box.w, box.h)
    }
    if (s.line && s.kind !== 'table') {
      ctx.strokeStyle = s.line
      ctx.lineWidth = Math.max(1, 12700 * scale)
      ctx.strokeRect(box.x, box.y, box.w, box.h)
    }
    const color = s.fill ? (luminance(s.fill) < 0.45 ? '#FFFFFF' : '#111111') : defaultColor
    if (s.kind === 'table' && s.cells?.length) {
      const rows = s.cells.length
      const rowH = box.h / rows
      ctx.strokeStyle = darkBg ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'
      ctx.lineWidth = 1
      s.cells.forEach((row, ri) => {
        const colW = box.w / Math.max(1, row.length)
        row.forEach((cell, ci) => {
          const cellBox = { x: box.x + ci * colW, y: box.y + ri * rowH, w: colW, h: rowH }
          ctx.strokeRect(cellBox.x, cellBox.y, cellBox.w, cellBox.h)
          drawTextBox(ctx, cell, cellBox, s.defaultSize, 1, 'ctr', scale, color)
        })
      })
      continue
    }
    if (s.paragraphs.length) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(box.x - 2, box.y - box.h * 0.1, box.w + 4, box.h * 1.2)
      ctx.clip()
      drawTextBox(ctx, s.paragraphs, box, s.defaultSize, s.fontScale, s.anchor, scale, color)
      ctx.restore()
    }
  }
  return canvas
}

/**
 * Clean typographic slide for content we only have as text (legacy .ppt
 * without an office suite, or script-only slides).
 */
export async function renderTextSlide(
  text: string,
  width: number,
  aspect: number,
  opts: { slideNumber?: number } = {},
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width)
  canvas.height = Math.round(width / aspect)
  const ctx = canvas.getContext('2d')!
  await document.fonts?.ready
  const W = canvas.width
  const H = canvas.height
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, '#15151a')
  grad.addColorStop(1, '#0c0c0f')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const [title = '', ...body] = lines
  const pad = W * 0.07
  const unit = W / 1280
  const paragraphs: PptxParagraph[] = []
  if (title) paragraphs.push({ runs: [{ text: title, size: 40, bold: true, color: '#F4F4F6' }], align: 'l', level: 0, bullet: false })
  for (const l of body.slice(0, 12)) {
    paragraphs.push({ runs: [{ text: l.replace(/^[•\-–*]\s*/, ''), size: 22, color: '#B4B4BE' }], align: 'l', level: 0, bullet: body.length > 1 })
  }
  // Treat 1280px as a 960pt-wide slide so sizes above read as points.
  const scale = unit / EMU_PER_PT / (960 / 1280)
  drawTextBox(ctx, paragraphs, { x: pad, y: pad * 0.9, w: W - pad * 2, h: H - pad * 1.8 }, 22, 1, 't', scale, '#F4F4F6')

  if (opts.slideNumber) {
    ctx.font = `500 ${14 * unit}px ${FONT_STACK}`
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.textAlign = 'right'
    ctx.fillText(String(opts.slideNumber), W - pad * 0.6, H - pad * 0.5)
    ctx.textAlign = 'left'
  }
  return canvas
}
