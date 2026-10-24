import type { Slide } from '../../types'

/** Turns the AI's two-line reply into at most two clean questions. */
export function parseSuggestions(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').replace(/^["“]|["”]$/g, '').trim())
    .filter((l) => l.length > 8)
    .map((l) => (/[?]$/.test(l) ? l : `${l.replace(/[.!]$/, '')}?`))
    .slice(0, 2)
}

const BANK: [RegExp, string][] = [
  [/\b(rais|funding|round|runway|use of funds|invest)/, 'How will you use the money you’re raising?'],
  [/\b(revenue|arr|mrr|sales|pricing|price|margin)/, 'How do you price it, and what are the unit economics?'],
  [/\b(customer|users|traction|growth|clients|pilots?)\b/, 'What does your traction look like month over month?'],
  [/\b(market|tam|sam|opportunity)\b/, 'How big is the market you can realistically reach?'],
  [/\b(compet|incumbent|alternative)/, 'What stops a bigger competitor from copying this?'],
  [/\b(team|founder|hire|engineer)/, 'Why is this team the right one to build it?'],
  [/\b(product|platform|technology|model|infrastructure)\b/, 'What’s technically hard about what you’ve built?'],
  [/\b(roadmap|next|plan|launch|milestone)/, 'What are the next milestones, and when?'],
]

/** Likely questions from the slide's own words, when the AI isn't available. */
export function localSuggestions(slide: Slide | undefined): string[] {
  const text = `${slide?.extractedText ?? ''} ${slide?.script ?? ''}`.toLowerCase()
  const picked = BANK.filter(([re]) => re.test(text)).map(([, q]) => q)
  return [...picked, 'What’s the most important point on this slide?', 'What would you need to prove this works at scale?'].slice(0, 2)
}
