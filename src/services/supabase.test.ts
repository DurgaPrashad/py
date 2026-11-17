import { describe, expect, it } from 'vitest'
import { isUnreachable, supabaseMessage, UNREACHABLE } from './supabase'

describe('account service errors', () => {
  it('says plainly when the service cannot be reached', () => {
    expect(supabaseMessage({ message: 'TypeError: Failed to fetch' })).toBe(UNREACHABLE)
    expect(supabaseMessage({ name: 'AuthRetryableFetchError', message: 'Load failed' })).toBe(UNREACHABLE)
    expect(isUnreachable(new Error(UNREACHABLE))).toBe(true)
  })

  it('keeps every other message as it was', () => {
    expect(isUnreachable({ message: 'Invalid login credentials' })).toBe(false)
    expect(supabaseMessage({ message: 'SI_REQUIRED: SI is part of the SI plan.' })).toBe('SI is part of the SI plan.')
  })
})
