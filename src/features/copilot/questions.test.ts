import { describe, expect, it } from 'vitest'
import { extractQuestion, looksLikeQuestion, QuestionTracker } from './questions'

describe('looksLikeQuestion', () => {
  it.each([
    'What is your customer acquisition cost?',
    'So how do you plan to use the money',
    'Um, can you walk me through the unit economics?',
    'Tell me about your go to market strategy.',
    "I'm curious how you compare to the incumbents.",
    "Okay. And who's on the founding team?",
    'Great demo. How many paying customers do you have today?',
    "Doesn't a bigger player just copy this?",
  ])('detects %s', (text) => expect(looksLikeQuestion(text)).toBe(true))

  it.each([
    'Thanks, that makes sense.',
    'We have about forty customers.',
    'Yeah.',
    'Right, okay.',
    'So the next slide shows our pipeline.',
    'How',
  ])('ignores %s', (text) => expect(looksLikeQuestion(text)).toBe(false))
})

describe('extractQuestion', () => {
  it('keeps the context sentence before the question', () => {
    expect(extractQuestion('Thanks for the demo. We use Stripe today. Why would we switch?')).toBe('We use Stripe today. Why would we switch?')
  })
})

describe('QuestionTracker', () => {
  it('joins a question with the context said just before it', () => {
    const t = new QuestionTracker()
    expect(t.push('We looked at three of your competitors last quarter.', 0)).toBeNull()
    expect(t.push('What makes you different?', 2000)).toBe('We looked at three of your competitors last quarter. What makes you different?')
  })

  it('does not join stale context', () => {
    const t = new QuestionTracker()
    t.push('We looked at three of your competitors last quarter.', 0)
    expect(t.push('What makes you different?', 20000)).toBe('What makes you different?')
  })

  it('ignores the same question heard twice', () => {
    const t = new QuestionTracker()
    expect(t.push('What is your burn rate?', 0)).toBe('What is your burn rate?')
    expect(t.push('What is your burn rate?', 3000)).toBeNull()
    expect(t.push('What is your burn rate?', 30000)).toBe('What is your burn rate?')
  })
})
