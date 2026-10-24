/// <reference types="node" />
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db, type PaymentRow } from './db.js'
import { env, HttpError } from './http.js'

export interface RazorpayKeys {
  id: string
  secret: string
  /** Where they came from, for /api/health. */
  source: 'environment' | 'supabase vault'
}

let vaultKeys: RazorpayKeys | null = null

/**
 * The Razorpay key pair: from the environment (RAZORPAY_KEY_ID /
 * RAZORPAY_KEY_SECRET), or else from Supabase Vault (secrets named
 * razorpay_key_id / razorpay_key_secret), read over DATABASE_URL.
 */
export async function razorpayKeys(): Promise<RazorpayKeys> {
  const id = env('RAZORPAY_KEY_ID')
  const secret = env('RAZORPAY_KEY_SECRET')
  if (id && secret) return { id, secret, source: 'environment' }
  if (vaultKeys) return vaultKeys
  if (env('DATABASE_URL')) {
    const rows = await db()<{ name: string; secret: string }[]>`
      select name, decrypted_secret as secret from vault.decrypted_secrets where name in ('razorpay_key_id', 'razorpay_key_secret')`
    const get = (n: string) => rows.find((r) => r.name === n)?.secret?.trim()
    const vid = get('razorpay_key_id')
    const vsecret = get('razorpay_key_secret')
    if (vid && vsecret) return (vaultKeys = { id: vid, secret: vsecret, source: 'supabase vault' })
  }
  throw new HttpError(
    503,
    "Payments aren't set up on the server yet: add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel → Settings → Environment Variables (Production) and redeploy, or save them in Supabase Vault. Check /api/health.",
    'NOT_CONFIGURED',
  )
}

/** Calls the Razorpay REST API with the configured key pair. */
export async function razorpay<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const keys = await razorpayKeys()
  const auth = Buffer.from(`${keys.id}:${keys.secret}`).toString('base64')
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
export function validCheckoutSignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
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
