import type { ScriptWord } from '../../types'
import { expandNumber } from './numbers'

/**
 * Pure disfluencies. Removed from recognized speech entirely: they never
 * appear in a script and carry no position information.
 */
export const HARD_FILLERS = new Set([
  'um', 'umm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'ah', 'ahh', 'eh', 'hmm', 'hm', 'mm', 'mmm', 'mhm', 'uhhuh',
])

/**
 * Discourse fillers. They are real words that may appear in a script, so
 * they are kept, but inserting them costs (almost) nothing during alignment.
 */
export const SOFT_FILLERS = new Set([
  'like', 'actually', 'basically', 'so', 'okay', 'ok', 'right', 'well', 'just', 'really', 'literally',
  'anyway', 'yeah', 'now', 'kinda', 'sorta',
])
const SOFT_PHRASES: string[][] = [
  ['you', 'know'],
  ['i', 'mean'],
  ['kind', 'of'],
  ['sort', 'of'],
  ['you', 'see'],
  ['let', 'me', 'see'],
]

export interface SpokenToken {
  text: string
  /** Soft filler: free to skip during alignment. */
  soft: boolean
}

/**
 * Normalize one whitespace-delimited piece of text into zero or more
 * comparison tokens: lowercase, no diacritics, no punctuation, apostrophes
 * folded ("we're" -> "were"), hyphenated words split, numbers spelled out.
 */
export function normalizePiece(raw: string): string[] {
  const lowered = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc`\u00b4]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/@/g, ' at ')
  const out: string[] = []
  for (const part of lowered.split(/[\s\-\u2010-\u2015/\\|_~]+/)) {
    if (!part) continue
    // Strip wrapping punctuation but keep characters numbers rely on.
    const core = part.replace(/^[^\p{L}\p{N}$€£¥₹]+/u, '').replace(/[^\p{L}\p{N}%+]+$/u, '')
    if (!core) continue
    const numeric = expandNumber(core)
    if (numeric) {
      out.push(...numeric)
      continue
    }
    // "A.I." -> "ai", "don't" -> "dont"
    const cleaned = core.replace(/[.'’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    if (!cleaned) continue
    for (const t of cleaned.split(' ')) {
      // Split letter/digit boundaries like "gpt4" only when it helps numbers.
      const mixed = /^([a-z]+)(\d+)$/.exec(t)
      if (mixed && mixed[2].length <= 4) out.push(mixed[1], ...(expandNumber(mixed[2]) ?? [mixed[2]]))
      else out.push(t)
    }
  }
  return out
}

/** Split a script into display words, each with its normalized tokens. */
export function tokenizeScript(script: string): ScriptWord[] {
  const pieces = script.split(/\s+/).filter(Boolean)
  const words: ScriptWord[] = []
  let pendingPrefix = ''
  for (const piece of pieces) {
    const tokens = normalizePiece(piece)
    if (tokens.length === 0) {
      // Pure punctuation ("—", "•") never gets its own slot in the
      // teleprompter window: attach it to a neighbour.
      if (words.length) words[words.length - 1].text += ' ' + piece
      else pendingPrefix += piece + ' '
      continue
    }
    words.push({ text: pendingPrefix + piece, tokens })
    pendingPrefix = ''
  }
  return words
}

export interface ScriptIndex {
  words: ScriptWord[]
  /** Flattened comparison tokens. */
  tokens: string[]
  /** tokens[i] belongs to words[tokenToWord[i]]. */
  tokenToWord: number[]
  /** First / last token index of each word. */
  wordFirstToken: number[]
  wordLastToken: number[]
}

export function buildScriptIndex(words: ScriptWord[]): ScriptIndex {
  const tokens: string[] = []
  const tokenToWord: number[] = []
  const wordFirstToken: number[] = []
  const wordLastToken: number[] = []
  words.forEach((w, wi) => {
    wordFirstToken.push(tokens.length)
    for (const t of w.tokens) {
      tokens.push(t)
      tokenToWord.push(wi)
    }
    wordLastToken.push(tokens.length - 1)
  })
  return { words, tokens, tokenToWord, wordFirstToken, wordLastToken }
}

/** Normalize recognized speech: drop disfluencies, mark soft fillers. */
export function tokenizeSpoken(text: string): SpokenToken[] {
  const flat: string[] = []
  for (const piece of text.split(/\s+/)) {
    if (piece) flat.push(...normalizePiece(piece))
  }
  const tokens: SpokenToken[] = []
  for (let i = 0; i < flat.length; i++) {
    const t = flat[i]
    if (HARD_FILLERS.has(t)) continue
    const phrase = SOFT_PHRASES.find((p) => p.every((w, k) => flat[i + k] === w))
    if (phrase) {
      for (let k = 0; k < phrase.length; k++) tokens.push({ text: flat[i + k], soft: true })
      i += phrase.length - 1
      continue
    }
    tokens.push({ text: t, soft: SOFT_FILLERS.has(t) })
  }
  return tokens
}
