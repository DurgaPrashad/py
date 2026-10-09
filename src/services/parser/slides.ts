import type { Extraction, Presentation, Slide } from '../../types'
import { newId } from '../../utils/id'
import { tokenizeScript } from '../alignment/normalize'
import { savePresentation } from '../storage/projects'
import { textToScript } from './script'

/**
 * Initial script: the speaker notes when there are any (that is what people
 * actually say), otherwise the slide text, but only when we trust it.
 * Low-confidence OCR output is never silently turned into a script.
 */
function initialScript(notes: string, extracted: string, extraction: Extraction): string {
  if (notes.trim()) return notes.trim()
  if (extraction.confidence >= 0.75) return textToScript(extracted)
  return ''
}

export function makeSlide(index: number, fields: Partial<Slide> & { extractedText: string; extraction: Extraction; notes?: string }): Slide {
  const notes = fields.notes ?? ''
  const script = fields.script ?? initialScript(notes, fields.extractedText, fields.extraction)
  return {
    id: fields.id ?? newId(),
    slideNumber: index + 1,
    image: fields.image ?? null,
    thumbnail: fields.thumbnail ?? null,
    extractedText: fields.extractedText,
    extraction: fields.extraction,
    script,
    words: tokenizeScript(script),
    notes,
  }
}

/** A new, empty presentation for script-only use (no slide file). */
export async function createBlankPresentation(name = 'Untitled presentation'): Promise<Presentation> {
  const now = Date.now()
  const presentation: Presentation = {
    version: 1,
    id: newId(),
    name,
    filePath: '',
    sourcePath: null,
    sourceType: 'blank',
    renderer: 'text',
    aspectRatio: 16 / 9,
    createdAt: now,
    updatedAt: now,
    slides: [makeSlide(0, { extractedText: '', extraction: { method: 'manual', confidence: 1 }, script: '' })],
  }
  return savePresentation(presentation, false)
}

export function newBlankSlide(index: number): Slide {
  return makeSlide(index, { extractedText: '', extraction: { method: 'manual', confidence: 1 }, script: '' })
}
