import type { ScriptWord } from '../../types'
import { buildScriptIndex, tokenizeSpoken, type ScriptIndex, type SpokenToken } from './normalize'
import { STOPWORDS, tokenWeight, wordSimilarity } from './similarity'

/*
 * Speech-to-script alignment.
 *
 * Every recognizer update is a hypothesis covering the last few seconds of
 * speech. We align its *tail* against the script with a local sequence
 * alignment (Smith-Waterman style) over fuzzy word similarity:
 *
 *   match           + weight(script word) scaled by similarity
 *   substitution    - (recognizer error or paraphrase)
 *   extra spoken    - (ad-lib), almost free for soft fillers ("like", "you know")
 *   skipped script  - (speaker dropped a word), cheaper for stopwords
 *
 * The alignment must end on a matched word near the end of the hypothesis
 * (the most recent thing said). Its script position becomes the candidate.
 * A positional prior and explicit evidence thresholds then decide whether
 * to move: small forward steps are cheap, big forward jumps need several
 * distinctive words, and moving backwards needs strong evidence confirmed
 * by two consecutive hypotheses. Pauses produce no new words, so nothing
 * moves; repeats re-match where we already are, so nothing moves either.
 */

export interface AlignerOptions {
  /** Only the most recent N spoken tokens are aligned. */
  maxHypothesisTokens: number
  /** Minimum word similarity that counts as a match. */
  matchThreshold: number
  /** Minimum alignment score required to move at all. */
  minScore: number
  /** Forward moves beyond this many tokens need stronger evidence. */
  jumpTokens: number
}

export const DEFAULT_ALIGNER_OPTIONS: AlignerOptions = {
  maxHypothesisTokens: 24,
  matchThreshold: 0.74,
  minScore: 0.9,
  jumpTokens: 12,
}

export type Direction = 'forward' | 'backward' | 'none'

export interface AlignmentOutcome {
  /** Token index of the last spoken script token (-1 = nothing yet). */
  position: number
  moved: boolean
  direction: Direction
  /** Best candidate considered (token index), for diagnostics. */
  candidate: number
  score: number
  matched: number
}

function prior(candidate: number, position: number): number {
  const d = candidate - position
  if (d >= 0 && d <= 2) return 0
  if (d > 2 && d <= 12) return -0.04 * (d - 2)
  if (d > 12) return -0.4 - 0.05 * (d - 12)
  return -1.0 - 0.08 * -d
}

export class ScriptAligner {
  readonly index: ScriptIndex
  private readonly opts: AlignerOptions
  private readonly weights: Float64Array
  private readonly skipCost: Float64Array
  private pos = -1
  private pendingBack: { target: number; hits: number } | null = null
  private simCache = new Map<string, Float32Array>()

  constructor(words: ScriptWord[], opts: Partial<AlignerOptions> = {}) {
    this.index = buildScriptIndex(words)
    this.opts = { ...DEFAULT_ALIGNER_OPTIONS, ...opts }
    const n = this.index.tokens.length
    this.weights = new Float64Array(n)
    this.skipCost = new Float64Array(n)
    this.index.tokens.forEach((t, i) => {
      this.weights[i] = tokenWeight(t)
      this.skipCost[i] = STOPWORDS.has(t) ? 0.2 : 0.45
    })
  }

  /** Token index of the last spoken token, -1 if none. */
  get position(): number {
    return this.pos
  }

  get tokenCount(): number {
    return this.index.tokens.length
  }

  /** Display word index of the last spoken word (0 before anything is said). */
  get wordIndex(): number {
    return this.pos < 0 ? 0 : this.index.tokenToWord[this.pos]
  }

  /** True once the final script token has been spoken. */
  get atEnd(): boolean {
    return this.index.tokens.length > 0 && this.pos >= this.index.tokens.length - 1
  }

  reset(): void {
    this.pos = -1
    this.pendingBack = null
  }

  /**
   * Manually mark display word `word` as the current (just spoken) word,
   * e.g. when the presenter clicks a word or nudges the cursor. Word 0
   * means "at the very beginning".
   */
  setWordIndex(word: number): void {
    const w = Math.max(0, Math.min(word, this.index.words.length - 1))
    this.pos = w <= 0 ? -1 : this.index.wordLastToken[w]
    this.pendingBack = null
  }

  private similarities(spoken: string): Float32Array {
    let row = this.simCache.get(spoken)
    if (!row) {
      if (this.simCache.size > 4000) this.simCache.clear()
      const tokens = this.index.tokens
      row = new Float32Array(tokens.length)
      for (let j = 0; j < tokens.length; j++) row[j] = wordSimilarity(spoken, tokens[j])
      this.simCache.set(spoken, row)
    }
    return row
  }

  /** Align a new hypothesis (raw text or pre-tokenized) and maybe move. */
  update(hypothesis: string | SpokenToken[]): AlignmentOutcome {
    const all = typeof hypothesis === 'string' ? tokenizeSpoken(hypothesis) : hypothesis
    const H = all.slice(-this.opts.maxHypothesisTokens)
    const none = (candidate = this.pos, score = 0, matched = 0): AlignmentOutcome => ({
      position: this.pos,
      moved: false,
      direction: 'none',
      candidate,
      score,
      matched,
    })
    const S = this.index.tokens
    if (H.length === 0 || S.length === 0) return none()

    // Restrict the search to a generous window around the current position.
    const lo = Math.max(0, this.pos - 80)
    const hi = Math.min(S.length, this.pos + 1 + 240)
    const N = hi - lo
    const M = H.length
    const W = N + 1
    const score = new Float64Array((M + 1) * W)
    const matched = new Uint16Array((M + 1) * W)
    const informative = new Uint16Array((M + 1) * W)
    // Last script-consuming step on the best path: 0 none, 1 match, 2 substitution, 3 skip.
    const lastStep = new Uint8Array((M + 1) * W)
    const thr = this.opts.matchThreshold

    // Tail penalty: spoken tokens after the alignment end are unexplained.
    const tail = new Float64Array(M + 1)
    for (let i = M - 1; i >= 0; i--) tail[i] = tail[i + 1] + (H[i].soft ? 0.03 : 0.35)

    let best = { total: -Infinity, raw: 0, j: -1, matched: 0, informative: 0 }

    for (let i = 1; i <= M; i++) {
      const h = H[i - 1]
      const sims = this.similarities(h.text)
      const insCost = h.soft ? 0.03 : 0.55
      const subCost = h.soft ? 0.3 : 0.6
      for (let jj = 1; jj <= N; jj++) {
        const j = lo + jj - 1 // script token index
        const c = i * W + jj
        const diag = (i - 1) * W + (jj - 1)
        const up = (i - 1) * W + jj
        const left = i * W + (jj - 1)
        const sim = sims[j]

        let v = 0
        let isMatch = false
        let m = 0
        let inf = 0
        let step = 0
        if (sim >= thr) {
          const w = this.weights[j]
          const cand = score[diag] + w * (0.4 + 0.6 * sim)
          if (cand > v) {
            v = cand
            isMatch = true
            m = matched[diag] + 1
            inf = informative[diag] + (w >= 0.7 ? 1 : 0)
            step = 1
          }
        } else {
          const cand = score[diag] - subCost
          if (cand > v) {
            v = cand
            m = matched[diag]
            inf = informative[diag]
            step = 2
          }
        }
        const candUp = score[up] - insCost
        if (candUp > v) {
          v = candUp
          isMatch = false
          m = matched[up]
          inf = informative[up]
          step = lastStep[up]
        }
        const candLeft = score[left] - this.skipCost[j]
        if (candLeft > v) {
          v = candLeft
          isMatch = false
          m = matched[left]
          inf = informative[left]
          step = 3
        }
        score[c] = v
        matched[c] = m
        informative[c] = inf
        lastStep[c] = step

        // A filler-like word ("for", "the") only counts as where the speaker
        // is if the script word before it was heard too; otherwise a
        // half-heard word ("in for" for "infrastructure") would jump ahead.
        const weakEnd = isMatch && this.weights[j] < 0.7 && lastStep[diag] !== 1
        if (isMatch && !weakEnd) {
          const raw = v - tail[i]
          const total = raw + prior(j, this.pos)
          if (total > best.total) best = { total, raw, j, matched: m, informative: inf }
        }
      }
    }

    if (best.j < 0 || best.raw < this.opts.minScore) return none(best.j, best.raw, best.matched)
    // A lone stopword ("the") never moves the prompter.
    if (best.informative < 1 && best.matched < 2) return none(best.j, best.raw, best.matched)

    const d = best.j - this.pos
    if (d > 0) {
      const isJump = d > this.opts.jumpTokens
      if (isJump && !(best.informative >= 2 && best.raw >= 2.4)) return none(best.j, best.raw, best.matched)
      this.pos = best.j
      this.pendingBack = null
      return { position: this.pos, moved: true, direction: 'forward', candidate: best.j, score: best.raw, matched: best.matched }
    }
    if (d === 0) {
      this.pendingBack = null
      return none(best.j, best.raw, best.matched)
    }

    // Backwards: only on strong, repeated evidence that the speaker really
    // went back (e.g. re-reading a sentence), never on a casual repeat.
    if (best.informative >= 3 && best.raw >= 3.5) {
      if (this.pendingBack && Math.abs(this.pendingBack.target - best.j) <= 3) this.pendingBack.hits++
      else this.pendingBack = { target: best.j, hits: 1 }
      if (this.pendingBack.hits >= 2) {
        this.pos = best.j
        this.pendingBack = null
        return { position: this.pos, moved: true, direction: 'backward', candidate: best.j, score: best.raw, matched: best.matched }
      }
    }
    return none(best.j, best.raw, best.matched)
  }
}
