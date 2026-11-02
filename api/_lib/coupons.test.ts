import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { couponOrderId, couponPlan } from './coupons.js'

describe('coupons', () => {
  beforeEach(() => {
    vi.stubEnv('COUPON_STANDARD_YEARLY', 'base-code')
    vi.stubEnv('COUPON_SI_YEARLY', 'si-code')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('maps each code to its yearly plan', () => {
    expect(couponPlan('base-code')).toBe('standard_yearly')
    expect(couponPlan('si-code')).toBe('si_yearly')
  })

  it('ignores capital letters and stray spaces', () => {
    expect(couponPlan('  BASE-Code ')).toBe('standard_yearly')
  })

  it('rejects anything else', () => {
    expect(couponPlan('nope')).toBeNull()
    expect(couponPlan('')).toBeNull()
    expect(couponPlan('   ')).toBeNull()
  })

  it('accepts nothing when the settings are empty', () => {
    vi.stubEnv('COUPON_STANDARD_YEARLY', '')
    vi.stubEnv('COUPON_SI_YEARLY', '')
    expect(couponPlan('')).toBeNull()
    expect(couponPlan('base-code')).toBeNull()
  })

  it('gives the same id for one account and code, however it is typed', () => {
    expect(couponOrderId(' BASE-code', 'user-1')).toBe(couponOrderId('base-code', 'user-1'))
  })

  it('gives a new id for another account or a new code', () => {
    const id = couponOrderId('base-code', 'user-1')
    expect(couponOrderId('base-code', 'user-2')).not.toBe(id)
    expect(couponOrderId('new-code', 'user-1')).not.toBe(id)
  })

  it('never contains the code itself', () => {
    expect(couponOrderId('base-code', 'user-1')).not.toContain('base-code')
  })
})
