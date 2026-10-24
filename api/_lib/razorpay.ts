import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, type PaymentRow } from './db.js'
import { HttpError, requireEnv } from './http.js'

export const keyId = () => requireEnv('RAZORPAY_KEY_ID')

/** Calls the Razorpay REST API with the key pair from the environment. */
export async function razorpay<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${keyId()}:${requireEnv('RAZORPAY_KEY_SECRET')}`).toString('base64')
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } }
  if (!res.ok) throw new HttpError(502, `Payment provider error (${res.status}): ${data.error?.description ?? 'unknown error'}`)
  return data
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

/** Checkout's signature: HMAC-SHA256(order_id|payment_id) with the key secret. */
export function validCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac('sha256', requireEnv('RAZORPAY_KEY_SECRET')).update(`${orderId}|${paymentId}`).digest('hex')
  return /^[0-9a-f]+$/i.test(signature) && safeEqualHex(expected, signature.toLowerCase())
}

/** Webhook signature: HMAC-SHA256(raw body) with the webhook secret. */
export function validWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return /^[0-9a-f]+$/i.test(signature) && safeEqualHex(expected, signature.toLowerCase())
}

interface RazorpayPayment {
  id: string
  order_id: string
  amount: number
  currency: string
  status: string
}

/**
 * Makes sure a Razorpay payment belongs to our order, captures it if the
 * account uses manual capture, and extends the plan. True once paid.
 */
export async function settle(pay: PaymentRow, payment: RazorpayPayment): Promise<boolean> {
  if (pay.status === 'paid') return true
  if (payment.order_id !== pay.razorpay_order_id || payment.amount !== pay.amount || payment.currency.toUpperCase() !== pay.currency.toUpperCase()) {
    return false
  }
  let status = payment.status
  if (status === 'authorized') {
    status = (await razorpay<RazorpayPayment>('POST', `/payments/${payment.id}/capture`, { amount: pay.amount, currency: pay.currency })).status
  }
  if (status !== 'captured') return false
  await db()`select private.grant_plan(${pay.id}::uuid, ${payment.id})`
  return true
}

/** Checks Razorpay for payments on an order we haven't marked paid yet. */
export async function settleOrder(pay: PaymentRow): Promise<boolean> {
  const { items } = await razorpay<{ items: RazorpayPayment[] }>('GET', `/orders/${pay.razorpay_order_id}/payments`)
  for (const payment of items ?? []) if (await settle(pay, payment)) return true
  return false
}

export async function paymentForOrder(orderId: string): Promise<PaymentRow | null> {
  const [row] = await db()<PaymentRow[]>`select * from public.payments where razorpay_order_id = ${orderId}`
  return row ?? null
}

export type { RazorpayPayment }
