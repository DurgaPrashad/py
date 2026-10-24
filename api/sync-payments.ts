/**
 * POST /api/sync-payments  ->  the user's profile, after applying any recent
 * paid-but-unconfirmed orders (e.g. the tab closed right after paying).
 */
import { db, profileOf, type PaymentRow } from './_lib/db.js'
import { handle, json, preflight } from './_lib/http.js'
import { settleOrder } from './_lib/razorpay.js'
import { requireUser } from './_lib/supabase.js'

export const OPTIONS = preflight

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const pending = await db()<PaymentRow[]>`
      select * from public.payments
      where user_id = ${user.id} and status = 'created' and created_at > now() - interval '7 days'
      order by created_at desc limit 3`
    for (const pay of pending) {
      try {
        await settleOrder(pay)
      } catch (e) {
        // Provider unreachable: try again on the next sync.
        console.warn('sync failed for', pay.razorpay_order_id, e)
      }
    }
    return json(await profileOf(user.id))
  })
}
