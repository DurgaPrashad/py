import type { VoiceCommand } from '../../types'
import { normalizePiece, tokenizeSpoken } from './normalize'

export const DEFAULT_COMMAND_PHRASES: Record<VoiceCommand, string[]> = {
  next: ['next slide', 'next'],
  previous: ['previous slide', 'go back', 'previous'],
  repeat: ['repeat slide', 'start over', 'repeat'],
  pause: ['pause teleprompter', 'pause'],
  resume: ['resume teleprompter', 'resume'],
}

// Politeness and lead-ins that may wrap a command ("okay, next slide please").
const WRAPPERS = new Set(['please', 'ok', 'okay', 'and', 'now', 'so', 'alright', 'right', 'lets', 'go', 'to', 'the'])

function phraseTokens(phrase: string): string[] {
  return phrase.split(/\s+/).flatMap(normalizePiece)
}

function stripWrappers(tokens: string[], keep: Set<string>): string[] {
  let a = 0
  let b = tokens.length
  while (a < b && WRAPPERS.has(tokens[a]) && !keep.has(tokens[a])) a++
  while (b > a && WRAPPERS.has(tokens[b - 1]) && !keep.has(tokens[b - 1])) b--
  return tokens.slice(a, b)
}

export class CommandMatcher {
  private readonly phrases: { command: VoiceCommand; tokens: string[] }[]
  private readonly keep: Set<string>

  constructor(config: Record<VoiceCommand, string[]>) {
    this.phrases = (Object.keys(config) as VoiceCommand[])
      .flatMap((command) => config[command].map((p) => ({ command, tokens: phraseTokens(p) })))
      .filter((p) => p.tokens.length > 0)
      // Longest phrases first so "next slide" wins over "next".
      .sort((a, b) => b.tokens.length - a.tokens.length)
    this.keep = new Set(this.phrases.flatMap((p) => p.tokens))
  }

  /**
   * A command only fires when it is the *entire* utterance: the speaker
   * paused, said the command, and paused again. Normal sentences that
   * merely contain "next" never qualify.
   *
   * `expectedNext` holds the script tokens the speaker is about to say. If
   * a one-word command is also the next script word, it is treated as
   * script, not a command; multi-word commands still fire.
   */
  match(utterance: string, expectedNext: string[] = []): VoiceCommand | null {
    const tokens = stripWrappers(
      tokenizeSpoken(utterance).map((t) => t.text),
      this.keep,
    )
    if (tokens.length === 0 || tokens.length > 4) return null
    for (const p of this.phrases) {
      if (p.tokens.length !== tokens.length) continue
      if (!p.tokens.every((t, i) => t === tokens[i])) continue
      if (p.tokens.length === 1 && expectedNext.slice(0, 2).includes(p.tokens[0])) return null
      return p.command
    }
    return null
  }

  /**
   * True if a (partial) hypothesis looks like the start of a command, so
   * alignment should not act on it.
   */
  isCommandLike(utterance: string): boolean {
    const tokens = stripWrappers(
      tokenizeSpoken(utterance).map((t) => t.text),
      this.keep,
    )
    if (tokens.length === 0 || tokens.length > 3) return false
    return this.phrases.some((p) => tokens.every((t, i) => p.tokens[i] === t))
  }
}
