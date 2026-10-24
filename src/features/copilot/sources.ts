/*
 * Sources: material the SI copilot can draw on beyond the deck itself. Files
 * are read on this device and only their text is kept with the presentation.
 */
import type { Source } from '../../types'
import { newId } from '../../utils/id'

/** Per-source cap, so one long document can't crowd out the rest. */
export const MAX_SOURCE_CHARS = 150_000

export const SOURCE_FILE_TYPES = '.pdf,.docx,.txt,.md,.markdown,.csv,.json'

export function textSource(title: string, content: string): Source {
  return { id: newId(), kind: 'text', title: title.trim() || 'Untitled note', content: content.trim().slice(0, MAX_SOURCE_CHARS), addedAt: Date.now() }
}

/** Reads a PDF, Word (.docx) or text file into a source. */
export async function fileSource(file: File): Promise<Source> {
  const name = file.name
  const ext = name.toLowerCase().split('.').pop() ?? ''
  let text: string
  if (ext === 'pdf') text = await pdfText(new Uint8Array(await file.arrayBuffer()))
  else if (ext === 'docx') text = await docxText(await file.arrayBuffer())
  else if (['txt', 'md', 'markdown', 'csv', 'json'].includes(ext)) text = await file.text()
  else throw new Error(`“${name}” isn't supported. Use PDF, Word (.docx) or text files.`)
  text = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!text) throw new Error(`No text found in “${name}”. Scanned PDFs need to be converted to text first.`)
  return {
    id: newId(),
    kind: 'file',
    title: name.replace(/\.[^.]+$/, ''),
    fileName: name,
    content: text.slice(0, MAX_SOURCE_CHARS),
    addedAt: Date.now(),
  }
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { cleanPageTexts, closePdf, extractPageText, openPdf } = await import('../../services/parser/pdf')
  const doc = await openPdf(bytes)
  try {
    const pages = []
    for (let i = 1; i <= doc.numPages; i++) pages.push(await extractPageText(await doc.getPage(i)))
    return cleanPageTexts(pages).join('\n\n')
  } finally {
    await closePdf(doc)
  }
}

/** Paragraph text from word/document.xml. */
async function docxText(data: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(data)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new Error('This Word file has no readable text.')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  return Array.from(doc.getElementsByTagNameNS(W, 'p'))
    .map((p) =>
      Array.from(p.getElementsByTagNameNS(W, '*'))
        .map((n) => (n.localName === 't' ? n.textContent : n.localName === 'tab' ? '\t' : n.localName === 'br' ? '\n' : ''))
        .join(''),
    )
    .join('\n')
}

export function sourceStats(s: Source): string {
  const words = s.content.split(/\s+/).filter(Boolean).length
  return `${words.toLocaleString()} words`
}
