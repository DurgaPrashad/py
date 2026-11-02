/**
 * POST /api/redeem-coupon  { code }  ->  { plan, profile }
 * Gives the account the coupon's yearly plan for free, once per account. It
 * goes through private.grant_plan like a paid order, as a payment of 0.
 */
import { couponOrderId, couponPlan } from './_lib/coupons.js'
import { db, profileOf } from './_lib/db.js'
import { handle, HttpError, json, preflight, readJson } from './_lib/http.js'
import { requireUser } from './_lib/supabase.js'

export const OPTIONS = preflight

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const { code } = await readJson<{ code?: unknown }>(request)
    const text = typeof code === 'string' ? code : ''
    const plan = couponPlan(text)
    if (!plan) {
      // A wrong code costs a moment, which makes guessing slow.
      await new Promise((resolve) => setTimeout(resolve, 600))
      throw new HttpError(400, "That coupon code isn't valid. Check the spelling and try again.", 'COUPON_INVALID')
    }

    const order = couponOrderId(text, user.id)
    const applied = await db().begin(async (sql) => {
      const [row] = await sql<{ id: string }[]>`
        insert into public.payments (user_id, plan, amount, currency, razorpay_order_id)
        select ${user.id}::uuid, id, 0, currency, ${order}::text from private.plans where id = ${plan}
        on conflict (razorpay_order_id) do nothing
        returning id`
      if (!row) return false
      await sql`select private.grant_plan(${row.id}::uuid, ${order})`
      return true
    })
    if (!applied) throw new HttpError(409, "You've already used this coupon on this account.", 'COUPON_USED')

    return json({ plan, profile: await profileOf(user.id) })
  })
}
