// Word-level fuzzy similarity tuned for speech-recognition errors:
// edit distance, truncated partial words and a coarse phonetic key.

export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'it', 'its', 'this', 'that', 'these', 'those', 'we', 'i',
  'you', 'he', 'she', 'they', 'our', 'your', 'their', 'my', 'me', 'us', 'them', 'do', 'does', 'did', 'have',
  'has', 'had', 'will', 'would', 'can', 'could', 'should', 'not', 'no', 'so', 'if', 'then', 'than', 'there',
  'here', 'what', 'which', 'who', 'how', 'when', 'where', 'why', 'all', 'some', 'any', 'more', 'most', 'very',
  'into', 'about', 'up', 'out', 'just', 'also', 'one', 'dont', 'im', 'were', 'thats', 'its', 'lets',
])

// Pairs recognizers commonly swap that edit distance alone would reject.
const EQUIVALENT: Record<string, string> = {
  an: 'a', okay: 'ok', gonna: 'going', wanna: 'want', gotta: 'got', till: 'until', til: 'until',
  cause: 'because', cuz: 'because', thru: 'through', tho: 'though', vs: 'versus',
}

function canonical(w: string): string {
  return EQUIVALENT[w] ?? w
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  let curr = new Array<number>(b.length + 1)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/** Coarse phonetic skeleton: consonant classes, vowels dropped. */
export function phoneticKey(w: string): string {
  if (!w) return ''
  let s = w
    .replace(/x/g, 'ks')
    .replace(/^kn/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^ps/, 's')
    .replace(/ph/g, 'f')
    .replace(/gh/g, '')
    .replace(/ck/g, 'k')
    .replace(/sch/g, 'sk')
    .replace(/(tion|sion)/g, 'xn')
    .replace(/ch|sh/g, 'x')
    .replace(/th/g, '0')
    .replace(/dg/g, 'j')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/[cq]/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'f')
    .replace(/b/g, 'p')
    .replace(/d/g, 't')
    .replace(/[gj]/g, 'k')
    .replace(/m/g, 'n')
  const first = s[0]
  s = first + s.slice(1).replace(/[aeiouyhw]/g, '')
  return s.replace(/(.)\1+/g, '$1')
}

/**
 * Similarity in [0, 1]. Short words must match exactly (or via a known
 * equivalence); longer words tolerate recognizer spelling errors and a
 * truncated final word ("infra" for "infrastructure").
 */
export function wordSimilarity(spoken: string, script: string): number {
  if (spoken === script) return 1
  const a = canonical(spoken)
  const b = canonical(script)
  if (a === b) return 0.95
  const la = a.length
  const lb = b.length
  const shorter = Math.min(la, lb)
  const longer = Math.max(la, lb)
  if (shorter <= 2) return 0

  let sim = 1 - levenshtein(a, b) / longer
  if (shorter === 3 && sim < 0.66) sim = 0

  // Truncated or compound: "valid" ~ "validated", "healthcare" ~ "health".
  if (shorter >= 4 && (b.startsWith(a) || a.startsWith(b))) {
    sim = Math.max(sim, 0.66 + 0.3 * (shorter / longer))
  }
  if (shorter >= 3 && phoneticKey(a) === phoneticKey(b)) {
    sim = Math.max(sim, 0.82)
  }
  return sim
}

/** How much a matched script token says about position. */
export function tokenWeight(token: string): number {
  if (STOPWORDS.has(token)) return 0.35
  return Math.min(1.5, Math.max(0.7, 0.5 + 0.12 * token.length))
}
