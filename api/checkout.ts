/**
 * POST /api/checkout  { plan }  ->  a Razorpay order for Checkout.
 * Prices come from the database (private.plans), never from the client.
 */
import { randomUUID } from 'node:crypto'
import { db, profileOf } from './_lib/db.js'
import { handle, HttpError, json, preflight, readJson } from './_lib/http.js'
import { keyId, razorpay } from './_lib/razorpay.js'
import { requireUser } from './_lib/supabase.js'

interface Plan {
  id: string
  label: string
  amount: number
  currency: string
}

export const OPTIONS = preflight

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const { plan: planId } = await readJson<{ plan?: string }>(request)
    const [plan] = await db()<Plan[]>`select id, label, amount, currency from private.plans where id = ${planId ?? ''}`
    if (!plan) throw new HttpError(400, 'Unknown plan.')
    const profile = await profileOf(user.id)

    const order = await razorpay<{ id: string }>('POST', '/orders', {
      amount: plan.amount,
      currency: plan.currency,
      receipt: `rx_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      notes: { user_id: user.id, plan: plan.id, email: user.email },
    })
    await db()`
      insert into public.payments (user_id, plan, amount, currency, razorpay_order_id)
      values (${user.id}, ${plan.id}, ${plan.amount}, ${plan.currency}, ${order.id})`

    return json({
      key_id: keyId(),
      order_id: order.id,
      amount: plan.amount,
      currency: plan.currency,
      description: plan.label,
      email: profile?.email ?? user.email,
      name: profile?.full_name ?? null,
    })
  })
}
