/// <reference types="node" />
import { createHash } from 'node:crypto'
import { env } from './http.js'

// The server setting that holds each code, and the yearly plan it gives. The
// codes are never in the repo or the app; changing a setting retires its old code.
const COUPONS = { COUPON_STANDARD_YEARLY: 'standard_yearly', COUPON_SI_YEARLY: 'si_yearly' } as const

export type CouponPlan = (typeof COUPONS)[keyof typeof COUPONS]

export const COUPON_SETTINGS = Object.keys(COUPONS) as (keyof typeof COUPONS)[]

const normalize = (code: string) => code.trim().toLowerCase()

/** The plan a code gives, or null. Capital letters and stray spaces don't matter. */
export function couponPlan(code: string): CouponPlan | null {
  const wanted = normalize(code)
  if (!wanted) return null
  for (const name of COUPON_SETTINGS) if (normalize(env(name) ?? '') === wanted) return COUPONS[name]
  return null
}

/**
 * The order id of a redemption. payments.razorpay_order_id is unique, so this
 * is what limits a coupon to once per account; a new code gets a new id.
 */
export function couponOrderId(code: string, userId: string): string {
  const digest = createHash('sha256').update(normalize(code)).digest('hex').slice(0, 12)
  return `coupon_${digest}_${userId}`
}
