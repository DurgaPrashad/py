import type { Presentation } from '../../types'
import { supabase, supabaseCode, supabaseMessage } from '../../services/supabase'

export interface CopilotAnswer {
  text: string
  si: boolean
  /** Free SI answers left, or null on the SI plan. */
  free_left: number | null
}

export class CopilotError extends Error {
  /** SI_REQUIRED, AI_NOT_CONFIGURED, … or null. */
  readonly code: string | null

  constructor(message: string, code: string | null) {
    super(message)
    this.code = code
  }
}

/** 'answer': a question asked on the call. 'script': slide text -> a spoken script. */
export async function askCopilot(input: string, context: string, mode: 'answer' | 'script' = 'answer'): Promise<CopilotAnswer> {
  const { data, error } = await supabase.rpc('ask_copilot', { p_question: input, p_context: context, p_mode: mode })
  if (error) throw new CopilotError(supabaseMessage(error), supabaseCode(error))
  return data as CopilotAnswer
}

const MAX_CONTEXT = 100_000

/** The presenter's material, as plain text for the copilot. */
export function deckContext(p: Presentation, currentSlide?: number): string {
  const parts: string[] = [`Presentation: ${p.name}`]
  if (p.qaNotes?.trim()) parts.push(`Q&A prep notes from the presenter:\n${p.qaNotes.trim()}`)
  for (const [i, s] of p.slides.entries()) {
    const lines = [`Slide ${i + 1}${i === currentSlide ? ' (on screen now)' : ''}`]
    if (s.extractedText.trim()) lines.push(`Slide text: ${s.extractedText.trim()}`)
    if (s.script.trim()) lines.push(`Script: ${s.script.trim()}`)
    if (s.notes.trim()) lines.push(`Notes: ${s.notes.trim()}`)
    if (lines.length > 1) parts.push(lines.join('\n'))
  }
  return parts.join('\n\n').slice(0, MAX_CONTEXT)
}
