import JSZip from 'jszip'

/*
 * PowerPoint (OOXML) parsing in the webview: slide order, text in a natural
 * reading order, speaker notes, and enough geometry/styling to draw a
 * faithful preview when no office suite is available for exact rendering.
 */

export const EMU_PER_PT = 12700

export interface PptxRun {
  text: string
  /** Points. */
  size?: number
  bold?: boolean
  italic?: boolean
  color?: string
}

export interface PptxParagraph {
  runs: PptxRun[]
  align: 'l' | 'ctr' | 'r' | 'just'
  level: number
  bullet: boolean
}

export interface PptxShape {
  kind: 'text' | 'picture' | 'table'
  x: number
  y: number
  w: number
  h: number
  placeholder?: string
  paragraphs: PptxParagraph[]
  /** Table cells as rows of paragraphs (kind === 'table'). */
  cells?: PptxParagraph[][][]
  fill?: string
  line?: string
  rounded?: boolean
  image?: string
  anchor: 't' | 'ctr' | 'b'
  fontScale: number
  defaultSize: number
  defaultColor?: string
}

export interface PptxSlide {
  index: number
  hidden: boolean
  shapes: PptxShape[]
  background: { color?: string; image?: string }
  /** Slide text in reading order. */
  text: string
  notes: string
}

export interface PptxDocument {
  width: number
  height: number
  slides: PptxSlide[]
  zip: JSZip
}

// ---------------------------------------------------------------- helpers

const parser = new DOMParser()

function children(el: Element | null | undefined, name?: string): Element[] {
  if (!el) return []
  return Array.from(el.children).filter((c) => !name || c.localName === name)
}

function child(el: Element | null | undefined, name: string): Element | undefined {
  return children(el, name)[0]
}

function path(el: Element | null | undefined, ...names: string[]): Element | undefined {
  let cur: Element | undefined = el ?? undefined
  for (const n of names) cur = child(cur, n)
  return cur
}

function descendants(el: Element | null | undefined, name: string): Element[] {
  return el ? Array.from(el.getElementsByTagNameNS('*', name)) : []
}

function num(el: Element | undefined, attr: string): number | undefined {
  const v = el?.getAttribute(attr)
  return v == null || v === '' ? undefined : Number(v)
}

/** Relationship attribute such as `r:id` / `r:embed` (namespaced, unlike plain `id`). */
function rid(el: Element | undefined, attr: string): string | undefined {
  if (!el) return undefined
  for (const a of Array.from(el.attributes)) {
    if (a.localName === attr && a.namespaceURI?.includes('/relationships')) return a.value
  }
  return undefined
}

async function readXml(zip: JSZip, file: string): Promise<Document | null> {
  const entry = zip.file(file)
  if (!entry) return null
  return parser.parseFromString(await entry.async('string'), 'application/xml')
}

function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

interface Rel {
  type: string
  target: string
}

async function readRels(zip: JSZip, file: string): Promise<Map<string, Rel>> {
  const relsPath = file.replace(/([^/]+)$/, '_rels/$1.rels')
  const doc = await readXml(zip, relsPath)
  const map = new Map<string, Rel>()
  for (const r of descendants(doc?.documentElement, 'Relationship')) {
    const id = r.getAttribute('Id')
    const target = r.getAttribute('Target')
    if (!id || !target || r.getAttribute('TargetMode') === 'External') continue
    map.set(id, { type: r.getAttribute('Type') ?? '', target: resolve(file, target) })
  }
  return map
}

const relOfType = (rels: Map<string, Rel>, suffix: string) => [...rels.values()].find((r) => r.type.endsWith(suffix))

// ---------------------------------------------------------------- colors

type Theme = Record<string, string>

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `${f(0)}${f(8)}${f(4)}`
}

function applyMods(hex: string, el: Element): string {
  let [h, s, l] = hexToHsl(hex)
  const lumMod = num(child(el, 'lumMod'), 'val')
  const lumOff = num(child(el, 'lumOff'), 'val')
  const tint = num(child(el, 'tint'), 'val')
  const shade = num(child(el, 'shade'), 'val')
  if (lumMod !== undefined) l *= lumMod / 100000
  if (lumOff !== undefined) l += lumOff / 100000
  if (tint !== undefined) l = l + (1 - l) * (1 - tint / 100000)
  if (shade !== undefined) l *= shade / 100000
  l = Math.max(0, Math.min(1, l))
  return hslToHex(h, s, l)
}

const SCHEME_ALIAS: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' }

/** Resolve a color element child (srgbClr / schemeClr / sysClr) of `el`. */
function colorIn(el: Element | undefined, theme: Theme): string | undefined {
  const srgb = child(el, 'srgbClr')
  if (srgb) return '#' + applyMods(srgb.getAttribute('val') ?? '000000', srgb)
  const scheme = child(el, 'schemeClr')
  if (scheme) {
    const key = scheme.getAttribute('val') ?? 'tx1'
    const base = theme[SCHEME_ALIAS[key] ?? key]
    return base ? '#' + applyMods(base, scheme) : undefined
  }
  const sys = child(el, 'sysClr')
  if (sys) return '#' + (sys.getAttribute('lastClr') ?? '000000')
  return undefined
}

/** Color of the solid fill declared on `fillParent` (spPr, rPr, ln, bgPr...). */
function colorOf(fillParent: Element | undefined, theme: Theme): string | undefined {
  return colorIn(child(fillParent, 'solidFill'), theme)
}

async function readTheme(zip: JSZip, masterPath: string): Promise<Theme> {
  const rels = await readRels(zip, masterPath)
  const rel = relOfType(rels, '/theme')
  const doc = rel ? await readXml(zip, rel.target) : null
  const theme: Theme = { dk1: '000000', lt1: 'FFFFFF', dk2: '1F2937', lt2: 'E5E7EB' }
  const scheme = descendants(doc?.documentElement, 'clrScheme')[0]
  for (const c of children(scheme)) {
    const srgb = child(c, 'srgbClr')?.getAttribute('val') ?? child(c, 'sysClr')?.getAttribute('lastClr')
    if (srgb) theme[c.localName] = srgb
  }
  return theme
}

// ---------------------------------------------------------------- layout inheritance

interface PlaceholderInfo {
  xfrm?: { x: number; y: number; w: number; h: number }
  size?: number
  anchor?: 't' | 'ctr' | 'b'
}

interface Inherited {
  layout: Map<string, PlaceholderInfo>
  master: Map<string, PlaceholderInfo>
  titleSize: number
  bodySizes: number[]
  otherSize: number
  background: { color?: string; image?: string }
}

function readXfrm(spPr: Element | undefined) {
  const xfrm = child(spPr, 'xfrm')
  const off = child(xfrm, 'off')
  const ext = child(xfrm, 'ext')
  if (!off || !ext) return undefined
  return { x: num(off, 'x') ?? 0, y: num(off, 'y') ?? 0, w: num(ext, 'cx') ?? 0, h: num(ext, 'cy') ?? 0 }
}

function phKey(ph: Element | undefined): { type: string; idx?: string } | undefined {
  if (!ph) return undefined
  return { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') ?? undefined }
}

const normType = (t: string) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' ? 'body' : t)

function collectPlaceholders(doc: Document | null): Map<string, PlaceholderInfo> {
  const map = new Map<string, PlaceholderInfo>()
  for (const sp of descendants(doc?.documentElement, 'sp')) {
    const key = phKey(path(sp, 'nvSpPr', 'nvPr', 'ph'))
    if (!key) continue
    const lvl1 = path(sp, 'txBody', 'lstStyle', 'lvl1pPr', 'defRPr')
    const anchor = path(sp, 'txBody', 'bodyPr')?.getAttribute('anchor') as PlaceholderInfo['anchor']
    const info: PlaceholderInfo = { xfrm: readXfrm(child(sp, 'spPr')), size: num(lvl1, 'sz'), anchor: anchor ?? undefined }
    if (key.idx) map.set(`idx:${key.idx}`, info)
    if (!map.has(`type:${normType(key.type)}`)) map.set(`type:${normType(key.type)}`, info)
  }
  return map
}

function backgroundOf(doc: Document | null, theme: Theme, rels: Map<string, Rel>): Inherited['background'] | undefined {
  const bgPr = path(doc?.documentElement, 'cSld', 'bg', 'bgPr')
  if (bgPr) {
    const color = colorOf(bgPr, theme)
    const blip = path(bgPr, 'blipFill', 'blip')
    const image = blip ? rels.get(rid(blip, 'embed') ?? '')?.target : undefined
    if (color || image) return { color, image }
  }
  const color = colorIn(path(doc?.documentElement, 'cSld', 'bg', 'bgRef'), theme)
  return color ? { color } : undefined
}

// ---------------------------------------------------------------- text

function readParagraphs(txBody: Element | undefined, theme: Theme): PptxParagraph[] {
  const out: PptxParagraph[] = []
  for (const p of children(txBody, 'p')) {
    const pPr = child(p, 'pPr')
    const runs: PptxRun[] = []
    const defRPr = child(pPr, 'defRPr')
    for (const r of children(p)) {
      if (r.localName === 'br') {
        runs.push({ text: '\n' })
        continue
      }
      if (r.localName !== 'r' && r.localName !== 'fld') continue
      if (r.localName === 'fld' && /slidenum|datetime/i.test(r.getAttribute('type') ?? '')) continue
      const t = child(r, 't')?.textContent ?? ''
      if (!t) continue
      const rPr = child(r, 'rPr')
      const sz = num(rPr, 'sz') ?? num(defRPr, 'sz')
      runs.push({
        text: t,
        size: sz !== undefined ? sz / 100 : undefined,
        bold: rPr?.getAttribute('b') === '1' || undefined,
        italic: rPr?.getAttribute('i') === '1' || undefined,
        color: colorOf(rPr, theme) ?? colorOf(defRPr, theme),
      })
    }
    out.push({
      runs,
      align: (pPr?.getAttribute('algn') as PptxParagraph['align']) ?? 'l',
      level: num(pPr, 'lvl') ?? 0,
      bullet: !child(pPr, 'buNone') && (!!child(pPr, 'buChar') || !!child(pPr, 'buAutoNum')),
    })
  }
  return out
}

export function paragraphText(paragraphs: PptxParagraph[]): string {
  return paragraphs
    .map((p) => p.runs.map((r) => r.text).join(''))
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function shapeText(s: PptxShape): string {
  if (s.kind === 'table' && s.cells) {
    return s.cells.map((row) => row.map((cell) => paragraphText(cell).replace(/\n/g, ' ')).filter(Boolean).join(', ')).filter(Boolean).join('\n')
  }
  return paragraphText(s.paragraphs)
}

/** Reading order: titles first, then top-to-bottom bands, left-to-right. */
export function readingOrder(shapes: PptxShape[], slideHeight: number): PptxShape[] {
  const band = slideHeight * 0.05
  const isTitle = (s: PptxShape) => s.placeholder === 'title' || s.placeholder === 'ctrTitle'
  return [...shapes].sort((a, b) => {
    if (isTitle(a) !== isTitle(b)) return isTitle(a) ? -1 : 1
    if (Math.abs(a.y - b.y) > band) return a.y - b.y
    return a.x - b.x
  })
}

// ---------------------------------------------------------------- shapes

interface Transform {
  ox: number
  oy: number
  sx: number
  sy: number
}

const IDENTITY: Transform = { ox: 0, oy: 0, sx: 1, sy: 1 }

function walkTree(
  tree: Element | undefined,
  tf: Transform,
  ctx: { theme: Theme; rels: Map<string, Rel>; inherited: Inherited; width: number; height: number },
  out: PptxShape[],
) {
  const place = (r: { x: number; y: number; w: number; h: number }) => ({
    x: tf.ox + r.x * tf.sx,
    y: tf.oy + r.y * tf.sy,
    w: r.w * tf.sx,
    h: r.h * tf.sy,
  })

  for (const el of children(tree)) {
    if (el.localName === 'grpSp') {
      const xfrm = path(el, 'grpSpPr', 'xfrm')
      const off = child(xfrm, 'off')
      const ext = child(xfrm, 'ext')
      const chOff = child(xfrm, 'chOff')
      const chExt = child(xfrm, 'chExt')
      if (off && ext && chOff && chExt) {
        const sx = (num(ext, 'cx') ?? 1) / (num(chExt, 'cx') || 1)
        const sy = (num(ext, 'cy') ?? 1) / (num(chExt, 'cy') || 1)
        const inner: Transform = {
          sx: tf.sx * sx,
          sy: tf.sy * sy,
          ox: tf.ox + ((num(off, 'x') ?? 0) - (num(chOff, 'x') ?? 0) * sx) * tf.sx,
          oy: tf.oy + ((num(off, 'y') ?? 0) - (num(chOff, 'y') ?? 0) * sy) * tf.sy,
        }
        walkTree(el, inner, ctx, out)
      } else {
        walkTree(el, tf, ctx, out)
      }
      continue
    }

    if (el.localName === 'sp') {
      const ph = phKey(path(el, 'nvSpPr', 'nvPr', 'ph'))
      if (ph && /^(sldNum|dt|ftr)$/.test(ph.type)) continue
      const spPr = child(el, 'spPr')
      // Placeholders inherit geometry and sizes along slide -> layout ->
      // master; resolve each property from the first level that defines it.
      const chain = ph
        ? [
            ph.idx ? ctx.inherited.layout.get(`idx:${ph.idx}`) : undefined,
            ctx.inherited.layout.get(`type:${normType(ph.type)}`),
            ph.idx ? ctx.inherited.master.get(`idx:${ph.idx}`) : undefined,
            ctx.inherited.master.get(`type:${normType(ph.type)}`),
          ].filter((x): x is PlaceholderInfo => !!x)
        : []
      const inheritedPh: PlaceholderInfo = {
        xfrm: chain.find((c) => c.xfrm)?.xfrm,
        size: chain.find((c) => c.size)?.size,
        anchor: chain.find((c) => c.anchor)?.anchor,
      }
      // Never lose text because its position is unknown: fall back to a
      // conventional title / body area.
      const fallback =
        ph && normType(ph.type) === 'title'
          ? { x: ctx.width * 0.06, y: ctx.height * 0.05, w: ctx.width * 0.88, h: ctx.height * 0.16 }
          : { x: ctx.width * 0.06, y: ctx.height * 0.25, w: ctx.width * 0.88, h: ctx.height * 0.65 }
      const xfrm = readXfrm(spPr) ?? inheritedPh.xfrm ?? fallback
      const bodyPr = path(el, 'txBody', 'bodyPr')
      const fontScale = (num(child(bodyPr, 'normAutofit'), 'fontScale') ?? 100000) / 100000
      const type = ph ? normType(ph.type) : undefined
      const level0 = type === 'title' ? ctx.inherited.titleSize : type === 'body' ? ctx.inherited.bodySizes[0] : ctx.inherited.otherSize
      const geom = child(spPr, 'prstGeom')?.getAttribute('prst')
      out.push({
        kind: 'text',
        ...place(xfrm),
        placeholder: ph?.type,
        paragraphs: readParagraphs(child(el, 'txBody'), ctx.theme),
        fill: child(spPr, 'noFill') ? undefined : colorOf(spPr, ctx.theme),
        line: colorOf(child(spPr, 'ln'), ctx.theme),
        rounded: geom === 'roundRect',
        anchor: (bodyPr?.getAttribute('anchor') as PptxShape['anchor']) ?? inheritedPh.anchor ?? (type === 'title' ? 'ctr' : 't'),
        fontScale,
        defaultSize: inheritedPh.size ? inheritedPh.size / 100 : level0,
      })
      continue
    }

    if (el.localName === 'pic') {
      const xfrm = readXfrm(child(el, 'spPr'))
      const blip = path(el, 'blipFill', 'blip')
      const target = ctx.rels.get(rid(blip, 'embed') ?? '')?.target
      if (xfrm && target) {
        out.push({ kind: 'picture', ...place(xfrm), paragraphs: [], image: target, anchor: 't', fontScale: 1, defaultSize: 18 })
      }
      continue
    }

    if (el.localName === 'graphicFrame') {
      const xfrmEl = child(el, 'xfrm')
      const off = child(xfrmEl, 'off')
      const ext = child(xfrmEl, 'ext')
      const tbl = descendants(el, 'tbl')[0]
      if (off && ext && tbl) {
        const cells = children(tbl, 'tr').map((tr) => children(tr, 'tc').map((tc) => readParagraphs(child(tc, 'txBody'), ctx.theme)))
        out.push({
          kind: 'table',
          ...place({ x: num(off, 'x') ?? 0, y: num(off, 'y') ?? 0, w: num(ext, 'cx') ?? 0, h: num(ext, 'cy') ?? 0 }),
          paragraphs: [],
          cells,
          anchor: 't',
          fontScale: 1,
          defaultSize: 14,
        })
      }
    }
  }
}

// ---------------------------------------------------------------- document

export async function parsePptx(data: Uint8Array): Promise<PptxDocument> {
  const zip = await JSZip.loadAsync(data)
  const presPath = 'ppt/presentation.xml'
  const pres = await readXml(zip, presPath)
  if (!pres) throw new Error('This file is not a valid PowerPoint presentation.')
  const sldSz = descendants(pres.documentElement, 'sldSz')[0]
  const width = num(sldSz, 'cx') ?? 12192000
  const height = num(sldSz, 'cy') ?? 6858000
  const presRels = await readRels(zip, presPath)
  const slidePaths = descendants(pres.documentElement, 'sldId')
    .map((s) => presRels.get(rid(s, 'id') ?? '')?.target)
    .filter((p): p is string => !!p)

  const layoutCache = new Map<string, Promise<{ inherited: Inherited; theme: Theme }>>()
  const loadLayout = (layoutPath: string) => {
    let entry = layoutCache.get(layoutPath)
    if (!entry) {
      entry = (async () => {
        const layoutDoc = await readXml(zip, layoutPath)
        const layoutRels = await readRels(zip, layoutPath)
        const masterPath = relOfType(layoutRels, '/slideMaster')?.target ?? 'ppt/slideMasters/slideMaster1.xml'
        const masterDoc = await readXml(zip, masterPath)
        const masterRels = await readRels(zip, masterPath)
        const theme = await readTheme(zip, masterPath)
        const txStyles = descendants(masterDoc?.documentElement, 'txStyles')[0]
        const sizeOf = (style: string, lvl: number) => num(path(txStyles, style, `lvl${lvl}pPr`, 'defRPr'), 'sz')
        const inherited: Inherited = {
          layout: collectPlaceholders(layoutDoc),
          master: collectPlaceholders(masterDoc),
          titleSize: (sizeOf('titleStyle', 1) ?? 4400) / 100,
          bodySizes: [1, 2, 3, 4, 5].map((l) => (sizeOf('bodyStyle', l) ?? 2800 - l * 200) / 100),
          otherSize: (sizeOf('otherStyle', 1) ?? 1800) / 100,
          background: backgroundOf(layoutDoc, theme, layoutRels) ?? backgroundOf(masterDoc, theme, masterRels) ?? { color: '#' + theme.lt1 },
        }
        return { inherited, theme }
      })()
      layoutCache.set(layoutPath, entry)
    }
    return entry
  }

  const slides: PptxSlide[] = []
  for (const [index, slidePath] of slidePaths.entries()) {
    const doc = await readXml(zip, slidePath)
    if (!doc) continue
    const rels = await readRels(zip, slidePath)
    const layoutPath = relOfType(rels, '/slideLayout')?.target
    const { inherited, theme } = layoutPath
      ? await loadLayout(layoutPath)
      : { inherited: { layout: new Map(), master: new Map(), titleSize: 44, bodySizes: [28, 24, 20, 18, 18], otherSize: 18, background: { color: '#FFFFFF' } } as Inherited, theme: { dk1: '000000', lt1: 'FFFFFF' } as Theme }

    const shapes: PptxShape[] = []
    walkTree(path(doc.documentElement, 'cSld', 'spTree'), IDENTITY, { theme, rels, inherited, width, height }, shapes)

    const text = readingOrder(shapes.filter((s) => s.kind !== 'picture'), height)
      .map(shapeText)
      .filter(Boolean)
      .join('\n\n')

    let notes = ''
    const notesRel = relOfType(rels, '/notesSlide')
    if (notesRel) {
      const notesDoc = await readXml(zip, notesRel.target)
      for (const sp of descendants(notesDoc?.documentElement, 'sp')) {
        const ph = phKey(path(sp, 'nvSpPr', 'nvPr', 'ph'))
        if (ph?.type === 'body') notes += paragraphText(readParagraphs(child(sp, 'txBody'), theme)) + '\n'
      }
    }

    slides.push({
      index,
      hidden: doc.documentElement.getAttribute('show') === '0',
      shapes,
      background: backgroundOf(doc, theme, rels) ?? inherited.background,
      text,
      notes: notes.trim(),
    })
  }
  if (!slides.length) throw new Error('No slides were found in this presentation.')
  return { width, height, slides, zip }
}
