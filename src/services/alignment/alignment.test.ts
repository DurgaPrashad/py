import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TranscriptEvent } from '../../types'
import { ScriptAligner } from './aligner'
import { CommandMatcher, DEFAULT_COMMAND_PHRASES } from './commands'
import { normalizePiece, tokenizeScript, tokenizeSpoken } from './normalize'
import { expandNumber } from './numbers'
import { wordSimilarity } from './similarity'
import { SyncSession } from './syncSession'

const fixture = (name: string): (TranscriptEvent & { wallMs: number })[] =>
  readFileSync(join(__dirname, '__fixtures__', name), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))

/** Display index of the first word whose text (lowercased, no punctuation) is `w`. */
function wordAt(script: string, w: string, occurrence = 1): number {
  const words = tokenizeScript(script)
  let seen = 0
  for (let i = 0; i < words.length; i++) {
    if (words[i].text.toLowerCase().replace(/[^a-z0-9]/g, '') === w && ++seen === occurrence) return i
  }
  throw new Error(`word ${w} not in script`)
}

describe('normalization', () => {
  it('spells out numbers, currency, percentages and ordinals', () => {
    expect(expandNumber('150,000+')).toEqual(['one', 'hundred', 'fifty', 'thousand', 'plus'])
    expect(expandNumber('3.5%')).toEqual(['three', 'point', 'five', 'percent'])
    expect(expandNumber('$5m')).toEqual(['five', 'million', 'dollars'])
    expect(expandNumber('21st')).toEqual(['twenty', 'first'])
    expect(expandNumber('2024')).toEqual(['two', 'thousand', 'twenty', 'four'])
  })

  it('folds punctuation, apostrophes, hyphens and acronyms', () => {
    expect(normalizePiece('“Real-time,”')).toEqual(['real', 'time'])
    expect(normalizePiece("We're")).toEqual(['were'])
    expect(normalizePiece('A.I.')).toEqual(['ai'])
    expect(normalizePiece('Café')).toEqual(['cafe'])
    expect(normalizePiece('—')).toEqual([])
  })

  it('keeps punctuation-only pieces out of the word window', () => {
    const words = tokenizeScript('Voice AI — a unified platform')
    expect(words.map((w) => w.text)).toEqual(['Voice', 'AI —', 'a', 'unified', 'platform'])
  })

  it('drops disfluencies and marks soft fillers', () => {
    const t = tokenizeSpoken('Today, uh, we are basically, you know, building')
    expect(t.map((x) => x.text)).toEqual(['today', 'we', 'are', 'basically', 'you', 'know', 'building'])
    expect(t.filter((x) => x.soft).map((x) => x.text)).toEqual(['basically', 'you', 'know'])
  })

  it('tolerates recognizer spelling errors but not unrelated words', () => {
    expect(wordSimilarity('infra', 'infrastructure')).toBeGreaterThan(0.74)
    expect(wordSimilarity('verifyable', 'verifiable')).toBeGreaterThan(0.74)
    expect(wordSimilarity('tory', 'tauri')).toBeGreaterThan(0.74)
    expect(wordSimilarity('the', 'a')).toBe(0)
    expect(wordSimilarity('platform', 'product')).toBeLessThan(0.74)
  })
})

describe('ScriptAligner', () => {
  const script = 'Today we are building an AI platform for every team on the planet.'
  const words = tokenizeScript(script)

  it('follows speech word by word from partial hypotheses', () => {
    const a = new ScriptAligner(words)
    const partials = ['Today', 'Today we', 'Today we are', 'Today we are building', 'Today we are building an AI']
    const seen = partials.map((p) => (a.update(p), a.wordIndex))
    expect(seen).toEqual([0, 1, 2, 3, 5])
  })

  it('ignores filler words', () => {
    const a = new ScriptAligner(words)
    a.update('Today, uh, we are basically building an AI platform')
    expect(a.wordIndex).toBe(6)
  })

  it('does not move during a pause (identical hypotheses)', () => {
    const a = new ScriptAligner(words)
    a.update('Today we are building')
    for (let i = 0; i < 5; i++) expect(a.update('Today we are building').moved).toBe(false)
    expect(a.wordIndex).toBe(3)
  })

  it('does not jump backwards when the speaker repeats a phrase', () => {
    const a = new ScriptAligner(words)
    a.update('Today we are building')
    const history: number[] = []
    for (const p of ['Today we are building today', 'Today we are building today we are', 'Today we are building today we are building an AI platform']) {
      a.update(p)
      history.push(a.wordIndex)
    }
    expect(history).toEqual([3, 3, 6])
  })

  it('survives skipped words and paraphrase', () => {
    const a = new ScriptAligner(words)
    a.update('Today we build an AI platform for every single team')
    expect(a.wordIndex).toBe(9)
  })

  it('holds position while the speaker ad-libs', () => {
    const a = new ScriptAligner(words)
    a.update('Today we are building an AI platform')
    a.update('an AI platform and honestly I think it is really cool')
    expect(a.wordIndex).toBe(6)
  })

  it('jumps ahead only with enough distinctive evidence', () => {
    const long = tokenizeScript(
      'Our mission is simple. We help teams communicate across every language. First we listen to thousands of conversations every day. Second we learn which responses actually work. Third we deliver those answers in real time.',
    )
    const a = new ScriptAligner(long)
    a.update('Our mission is simple')
    expect(a.update('the').moved).toBe(false)
    a.update('Third we deliver those answers')
    expect(long[a.wordIndex].text).toBe('answers')
  })

  it('does not jump ahead on a half-heard word, so it never has to step back', () => {
    // Exact partial sequence recorded from the app at 150 ms updates.
    const w = tokenizeScript('we are building the operating infrastructure for global Voice AI.')
    const a = new ScriptAligner(w)
    const seen: number[] = []
    for (const h of [
      'we are, uh, basically building the opera.',
      'basically building the operating in for the...',
      'basically building the operating infrastructure.',
      'building the operating infrastructure for',
      'building the operating infrastructure for glob.',
    ]) {
      a.update(h)
      seen.push(a.wordIndex)
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    expect(w[seen[seen.length - 1]].text).toBe('global')
  })

  it('matches numbers spoken as digits or words', () => {
    const w = tokenizeScript('More than 150,000+ directly verifiable AI calls.')
    const a = new ScriptAligner(w)
    a.update('more than one hundred and fifty thousand directly verifiable')
    expect(w[a.wordIndex].text).toBe('verifiable')
    const b = new ScriptAligner(w)
    b.update('more than 150,000 directly verifiable AI calls')
    expect(b.atEnd).toBe(true)
  })
})

describe('voice commands', () => {
  const m = new CommandMatcher(DEFAULT_COMMAND_PHRASES)

  it('fires only when the command is the whole utterance', () => {
    expect(m.match('Next slide.')).toBe('next')
    expect(m.match('Okay, next slide please.')).toBe('next')
    expect(m.match('Previous')).toBe('previous')
    expect(m.match('The next big thing is voice.')).toBeNull()
    expect(m.match('Pause.')).toBe('pause')
  })

  it('treats a one-word command as script when it is the next script word', () => {
    expect(m.match('Next', ['next', 'we'])).toBeNull()
    expect(m.match('Next slide', ['next', 'we'])).toBe('next')
  })
})

/** Replay a recorded recognizer session and return the word index after each event. */
function replay(name: string, script: string, commands = false) {
  const session = new SyncSession(tokenizeScript(script), commands ? new CommandMatcher(DEFAULT_COMMAND_PHRASES) : null)
  const trace: { wallMs: number; word: number; text: string; dir: string; command?: string }[] = []
  for (const e of fixture(name)) {
    const r = session.handle(e)
    trace.push({ wallMs: e.wallMs, word: session.aligner.wordIndex, text: e.text, dir: r.outcome?.direction ?? 'none', command: r.command })
  }
  return { session, trace }
}

function firstEventContaining(trace: { text: string }[], needle: string): number {
  return trace.findIndex((t) => t.text.toLowerCase().includes(needle))
}

describe('recorded speech replays (real whisper.cpp output)', () => {
  const scriptA =
    'Today I want to show you how we are building the operating infrastructure for global Voice AI. We have built and validated the product in real production environments, with more than 150,000 directly verifiable AI calls.'

  for (const name of ['fillers-repeat.jsonl', 'fillers-repeat-tiny.jsonl', 'fillers-repeat-fast.jsonl']) {
    it(`${name}: tracks fillers, repeats and numbers to the end without going backwards`, () => {
      const { session, trace } = replay(name, scriptA)
      expect(trace.some((t) => t.dir === 'backward')).toBe(false)
      expect(session.aligner.atEnd).toBe(true)
      // When "operating" is first recognized the prompter is already there.
      const i = firstEventContaining(trace, 'operating')
      expect(trace[i].word).toBe(wordAt(scriptA, 'operating'))
      // Position never decreases.
      for (let k = 1; k < trace.length; k++) expect(trace[k].word).toBeGreaterThanOrEqual(trace[k - 1].word)
    })
  }

  const scriptB =
    'Our mission is simple. We help teams communicate across every language. First, we listen to thousands of conversations every day. Second, we learn which responses actually work. Third, we deliver those answers in real time to every agent on the floor.'

  it.each(['skip-adlib.jsonl', 'skip-adlib-fast.jsonl'])('%s: waits through the pause and ad-lib, then follows a skipped sentence', (name) => {
    const { session, trace } = replay(name, scriptB)
    expect(trace.some((t) => t.dir === 'backward')).toBe(false)
    // During the ad-lib the prompter stays on "language".
    const adlib = firstEventContaining(trace, 'matters')
    expect(trace[adlib].word).toBe(wordAt(scriptB, 'language'))
    expect(session.aligner.atEnd).toBe(true)
  })

  it('reread: moves back when the speaker clearly restarts a passage, then finishes', () => {
    const { session, trace } = replay('reread.jsonl', scriptB)
    const back = trace.findIndex((t) => t.dir === 'backward')
    expect(back).toBeGreaterThan(-1)
    expect(trace[back].word).toBeLessThanOrEqual(wordAt(scriptB, 'conversations'))
    expect(tokenizeScript(scriptB)[session.aligner.wordIndex].text).toBe('time')
  })

  it('command: "Next slide" after a pause is a command and does not move the prompter', () => {
    const { trace } = replay('command.jsonl', scriptB, true)
    const commands = trace.filter((t) => t.command)
    expect(commands.map((c) => c.command)).toEqual(['next'])
    expect(trace[trace.length - 1].word).toBe(wordAt(scriptB, 'floor'))
  })
})
