import type { ScriptWord, TranscriptEvent, VoiceCommand } from '../../types'
import { ScriptAligner, type AlignmentOutcome } from './aligner'
import { CommandMatcher } from './commands'

export interface SyncResult {
  outcome?: AlignmentOutcome
  command?: VoiceCommand
  /** The spoken text that was considered (after slide-change filtering). */
  text: string
}

/**
 * Glue between recognizer events and the script position for one slide:
 * filters out speech that belongs to a previous slide, routes final
 * utterances to voice-command detection, respects pause, and feeds
 * everything else to the aligner. Used by the presenter UI and by the
 * fixture replay tests, so both exercise the same code path.
 */
export class SyncSession {
  aligner: ScriptAligner
  paused = false
  commands: CommandMatcher | null
  private cutoffMs = 0
  private latestMs = 0

  constructor(words: ScriptWord[], commands: CommandMatcher | null = null) {
    this.aligner = new ScriptAligner(words)
    this.commands = commands
  }

  /** Switch to another slide's script. Speech heard so far is ignored. */
  setScript(words: ScriptWord[]): void {
    this.aligner = new ScriptAligner(words)
    this.cutoffMs = this.latestMs
  }

  /** Restart the current script from the top (e.g. "Repeat"). */
  restart(): void {
    this.aligner.reset()
    this.cutoffMs = this.latestMs
  }

  private textOf(event: TranscriptEvent): string {
    if (event.windowStartMs >= this.cutoffMs) return event.text
    const timed = event.words.some((w) => w.endMs > 0)
    if (!timed) return event.windowEndMs > this.cutoffMs + 1500 ? event.text : ''
    return event.words
      .filter((w) => w.startMs >= this.cutoffMs - 50)
      .map((w) => w.text)
      .join(' ')
  }

  handle(event: TranscriptEvent): SyncResult {
    this.latestMs = Math.max(this.latestMs, event.windowEndMs)
    const text = this.textOf(event)
    if (!text.trim()) return { text }

    if (event.isFinal && this.commands) {
      const pos = this.aligner.position
      const expectedNext = this.aligner.index.tokens.slice(pos + 1, pos + 3)
      const command = this.commands.match(text, expectedNext)
      if (command) {
        // Whatever follows a command belongs to the new state.
        this.cutoffMs = this.latestMs
        return { command, text }
      }
    }
    if (this.paused) return { text }
    if (this.commands?.isCommandLike(text)) return { text }
    return { outcome: this.aligner.update(text), text }
  }
}
