import type { Presentation, Settings } from '../../types'
import { supabase, supabaseCode, supabaseMessage } from '../../services/supabase'
import { complete, ownKeyReady, PROVIDERS } from './providers'
import { systemPrompt, userPrompt, type CopilotMode } from './prompts'

export interface CopilotAnswer {
  text: string
  si: boolean
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

export interface RunOptions {
  /** Called with the answer so far while it streams in. */
  onText?: (soFar: string) => void
  /** Recent "Q: … / A: …" lines, so follow-up questions keep their context. */
  history?: string
  signal?: AbortSignal
}

const TIMEOUT_MS: Record<CopilotMode, number> = { answer: 45_000, suggest: 25_000, script: 60_000 }

/**
 * Answers a question ('answer'), drafts a slide script ('script') or suggests
 * two likely questions ('suggest') with the presenter's own AI provider and
 * key, straight from this device. Checks the SI plan first; times out rather
 * than hang.
 */
export async function runCopilot(si: Settings['si'], mode: CopilotMode, input: string, context: string, opts: RunOptions = {}): Promise<CopilotAnswer> {
  if (!ownKeyReady(si)) {
    throw new CopilotError(`Connect your AI first: add your ${PROVIDERS[si.provider].label} API key in Settings → SI.`, 'AI_NOT_CONFIGURED')
  }
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS[mode])
  opts.signal?.addEventListener('abort', () => timeout.abort())
  try {
    const { data, error } = await supabase.rpc('claim_copilot_use', { p_mode: mode })
    if (error) throw rpcError(error)
    const text = await complete(si, {
      system: systemPrompt(si, mode),
      material: context,
      prompt: userPrompt(mode, input, opts.history),
      maxTokens: mode === 'suggest' ? 1500 : undefined,
      onText: opts.onText,
      signal: timeout.signal,
    })
    if (!text.trim()) throw new CopilotError(`${PROVIDERS[si.provider].label} returned an empty answer. Try again or pick another model.`, 'EMPTY')
    return { text, si: (data as { si?: boolean } | null)?.si ?? true }
  } catch (e) {
    if (timeout.signal.aborted && !opts.signal?.aborted) throw new CopilotError('The AI took too long to answer. Try again.', 'TIMEOUT')
    throw e
  } finally {
    clearTimeout(timer)
  }
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
