/**
 * Spotting questions in a live call transcript. The recognizer finalizes an
 * utterance at each pause; a question is an utterance that ends with "?" or
 * has a sentence that opens like one ("How do you…", "Tell me about…").
 */

const OPENERS = [
  'what', "what's", 'whats', 'how', "how's", 'why', 'when', 'where', 'who', "who's", 'whom', 'whose', 'which',
  'can', 'could', 'would', 'will', 'should', 'shall', 'do', 'does', 'did', 'is', 'are', 'was', 'were',
  'have', 'has', 'had', 'may', 'might', "isn't", "aren't", "don't", "doesn't", "didn't", "won't", "wouldn't", "can't", "couldn't",
]
const PHRASES = [
  'tell me', 'tell us', 'walk me', 'walk us', 'talk me', 'talk us', 'explain', 'describe', 'help me understand', 'help us understand',
  "i'm curious", 'i am curious', 'i was curious', 'i wonder', "i'd love to know", "i'd like to know", 'i want to know', 'any thoughts',
  'give me a sense', 'give us a sense', 'elaborate', 'clarify',
]
// Spoken lead-ins that come before the real opener: "So, how do you…"
const LEAD_INS = new Set(['so', 'and', 'but', 'okay', 'ok', 'um', 'uh', 'er', 'well', 'yeah', 'right', 'alright', 'great', 'cool', 'sure', 'also', 'then', 'now', 'just', 'quick', 'question', 'one', 'my'])

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, ' ').split(/\s+/).filter(Boolean)

/** Split into sentences, keeping their end punctuation. */
export function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean)
}

function opensLikeQuestion(sentence: string): boolean {
  const w = words(sentence)
  let i = 0
  while (i < w.length - 1 && LEAD_INS.has(w[i])) i++
  const rest = w.slice(i)
  if (rest.length < 3) return false
  if (OPENERS.includes(rest[0])) return true
  const joined = rest.join(' ')
  return PHRASES.some((p) => joined.startsWith(p))
}

/** True when an utterance is (or contains) a question worth answering. */
export function looksLikeQuestion(text: string): boolean {
  const all = words(text)
  if (all.length < 3) return false
  return sentences(text).some((s) => (/\?\s*$/.test(s) && words(s).length >= 3) || opensLikeQuestion(s))
}

/**
 * The question part of an utterance: from the sentence just before the first
 * question-like sentence (often context, "We use Stripe today.") to the end,
 * capped to the last ~80 words.
 */
export function extractQuestion(text: string): string {
  const parts = sentences(text)
  const first = parts.findIndex((s) => /\?\s*$/.test(s) || opensLikeQuestion(s))
  const kept = first < 0 ? parts : parts.slice(Math.max(0, first - 1))
  const out = kept.join(' ').split(/\s+/)
  return out.slice(Math.max(0, out.length - 80)).join(' ')
}

/**
 * Turns finalized call utterances into questions. An utterance that is a
 * question is joined with the one just before it when that came within a few
 * seconds (speakers often pause between context and the question itself).
 */
export class QuestionTracker {
  private prev: { text: string; at: number } | null = null
  private lastQuestion: { text: string; at: number } | null = null
  private joinWindowMs: number

  constructor(joinWindowMs = 5000) {
    this.joinWindowMs = joinWindowMs
  }

  /** Feed one final utterance; returns the question to answer, if any. */
  push(text: string, at = Date.now()): string | null {
    const clean = text.trim()
    if (!clean) return null
    const prev = this.prev
    this.prev = { text: clean, at }
    if (!looksLikeQuestion(clean)) return null
    let question = extractQuestion(clean)
    if (prev && at - prev.at <= this.joinWindowMs && !looksLikeQuestion(prev.text) && words(question).length < 25) {
      question = `${prev.text} ${question}`
    }
    // The same question re-heard (echo, repeat) within 15 s is ignored.
    const key = words(question).join(' ')
    if (this.lastQuestion && this.lastQuestion.text === key && at - this.lastQuestion.at < 15000) return null
    this.lastQuestion = { text: key, at }
    this.prev = null
    return question
  }
}
