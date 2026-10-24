import { describe, expect, it } from 'vitest'
import type { Slide } from '../../types'
import { localSuggestions, parseSuggestions } from './suggestions'

describe('parseSuggestions', () => {
  it('cleans numbering and keeps two questions', () => {
    expect(parseSuggestions('1. How will you reach 1M calls a month?\n2) What is your CAC\n3. Extra one?')).toEqual([
      'How will you reach 1M calls a month?',
      'What is your CAC?',
    ])
  })
})

describe('localSuggestions', () => {
  it('picks questions that match the slide', () => {
    const slide = { extractedText: 'Use of funds: $1.5M round', script: 'We compete with incumbents' } as Slide
    expect(localSuggestions(slide)).toEqual(['How will you use the money you’re raising?', 'What stops a bigger competitor from copying this?'])
  })
  it('always offers two', () => {
    expect(localSuggestions(undefined)).toHaveLength(2)
  })
})
