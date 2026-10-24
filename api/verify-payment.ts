/**
 * POST /api/verify-payment  { order_id, payment_id, signature }
 * Called by Checkout's success handler: checks the signature, confirms the
 * payment with Razorpay (capturing it if needed) and extends the plan.
 */
import { db, profileOf, type PaymentRow } from './_lib/db.js'
import { handle, HttpError, json, preflight, readJson } from './_lib/http.js'
import { razorpay, settle, validCheckoutSignature, type RazorpayPayment } from './_lib/razorpay.js'
import { requireUser } from './_lib/supabase.js'

export const OPTIONS = preflight

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const user = await requireUser(request)
    const { order_id, payment_id, signature } = await readJson<{ order_id?: string; payment_id?: string; signature?: string }>(request)
    if (!order_id || !payment_id || !signature) throw new HttpError(400, 'Missing payment details.')

    const [pay] = await db()<PaymentRow[]>`select * from public.payments where razorpay_order_id = ${order_id} and user_id = ${user.id}`
    if (!pay) throw new HttpError(404, 'Unknown order.')
    if (pay.status !== 'paid') {
      if (!validCheckoutSignature(order_id, payment_id, signature)) throw new HttpError(400, 'Payment could not be verified.')
      const payment = await razorpay<RazorpayPayment>('GET', `/payments/${encodeURIComponent(payment_id)}`)
      if (!(await settle(pay, payment))) {
        throw new HttpError(409, 'Payment is not complete yet. If you were charged, it will be applied automatically.')
      }
    }
    return json(await profileOf(user.id))
  })
}
