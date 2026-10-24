import type { Presentation, Settings } from '../../types'
import { supabase, supabaseCode, supabaseMessage } from '../../services/supabase'
import { complete, PROVIDERS } from './providers'
import { stylePreferences, systemPrompt, userPrompt, type CopilotMode } from './prompts'

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

const rpcError = (error: unknown) => new CopilotError(supabaseMessage(error), supabaseCode(error))

/**
 * Answers a question ('answer') or drafts a slide script ('script') with the
 * presenter's chosen AI: the built-in one (server-side, site key) or their own
 * API key (straight from this device). Both check the SI plan / trial first.
 */
export async function runCopilot(
  si: Settings['si'],
  mode: CopilotMode,
  input: string,
  context: string,
  onText?: (soFar: string) => void,
): Promise<CopilotAnswer> {
  if (si.provider === 'reflex') {
    const { data, error } = await supabase.rpc('ask_copilot', { p_question: input, p_context: context, p_mode: mode, p_style: stylePreferences(si, mode) || null })
    if (error) throw rpcError(error)
    return data as CopilotAnswer
  }
  const { data, error } = await supabase.rpc('claim_copilot_use', { p_mode: mode })
  if (error) throw rpcError(error)
  const claim = data as Omit<CopilotAnswer, 'text'>
  const text = await complete(si, { system: systemPrompt(si, mode), material: context, prompt: userPrompt(mode, input), onText })
  if (!text) throw new CopilotError(`${PROVIDERS[si.provider].label} returned an empty answer. Try again or pick another model.`, null)
  return { ...claim, text }
}

/** Is the site's built-in AI switched on? */
export async function builtInAvailable(): Promise<boolean> {
  const { data } = await supabase.rpc('copilot_allowance')
  return !!(data as { configured?: boolean } | null)?.configured
}

const MAX_CONTEXT = 300_000

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
  // Sources last: if they run long, they are what gets trimmed, not the deck.
  for (const src of p.sources ?? []) parts.push(`Source — ${src.title}${src.fileName ? ` (${src.fileName})` : ''}:\n${src.content}`)
  return parts.join('\n\n').slice(0, MAX_CONTEXT)
}
