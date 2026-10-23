import type { Settings } from '../../types'

/** Mirrors the built-in AI's prompts in supabase/migrations (ask_copilot). */
const ANSWER = `You are a live Q&A copilot for someone presenting on a video call - an investor pitch, a client demo, a webinar or an interview. Someone on the call has just asked a question. Using only the presenter's material (deck text, speaking scripts, notes and prep notes), write what the presenter could say back.

How to answer:
- Speak as the presenter, in the first person, in plain spoken language.
- Start with a one-sentence direct answer, then at most three short lines that each begin with "• " and carry the specifics (numbers, names, examples) from the material.
- Keep the whole answer under 90 words so it can be read at a glance mid-conversation.
- Never invent facts, figures, customers or claims that are not in the material. If the material does not cover the question, say so in one line and suggest an honest reply, such as offering to follow up with the details.
- The question was transcribed from speech and may contain recognition errors; answer the question that was most likely meant.
- Output only the answer text: no preamble, no headings, no markdown other than the "• " bullets.`

const SCRIPT = `You write speaking scripts for presentation slides. Given the deck context and one slide's text, write what the presenter should say for that slide: natural spoken sentences (not bullets), first person, 50 to 110 words, confident and specific, using only facts from the material. Output only the script text.`

const LENGTH: Record<Settings['si']['answerLength'], { answer: string; script: string }> = {
  short: { answer: 'Keep answers very short: one sentence and at most two bullets, under 45 words.', script: 'Keep the script to 40–70 words.' },
  standard: { answer: '', script: '' },
  detailed: {
    answer: 'Answers may be fuller: up to two sentences and five bullets, under 160 words.',
    script: 'The script may run 100–170 words.',
  },
}

export type CopilotMode = 'answer' | 'script'

/** The presenter's preferences, as one block of text (sent to the built-in AI too). */
export function stylePreferences(si: Settings['si'], mode: CopilotMode): string {
  return [LENGTH[si.answerLength][mode], si.instructions.trim()].filter(Boolean).join('\n')
}

export function systemPrompt(si: Settings['si'], mode: CopilotMode): string {
  const prefs = stylePreferences(si, mode)
  const base = mode === 'answer' ? ANSWER : SCRIPT
  return prefs ? `${base}\n\nThe presenter's preferences (they override the length guidance above, never the rule against inventing facts):\n${prefs}` : base
}

export function userPrompt(mode: CopilotMode, input: string): string {
  return mode === 'answer' ? `<question>${input.slice(0, 2000)}</question>` : `<slide>${input.slice(0, 8000)}</slide>`
}
