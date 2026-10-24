/**
 * POST /api/razorpay-webhook  (Razorpay Dashboard → Webhooks)
 * Applies payments even if the buyer's browser never came back: events
 * payment.captured, payment.authorized and order.paid. Set the same secret in
 * the dashboard and in RAZORPAY_WEBHOOK_SECRET.
 */
import { handle, HttpError, json, requireEnv } from './_lib/http.js'
import { paymentForOrder, settle, settleOrder, validWebhookSignature, type RazorpayPayment } from './_lib/razorpay.js'

interface WebhookEvent {
  event: string
  payload?: { payment?: { entity?: RazorpayPayment }; order?: { entity?: { id: string } } }
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const raw = await request.text()
    const signature = request.headers.get('x-razorpay-signature') ?? ''
    if (!validWebhookSignature(raw, signature, requireEnv('RAZORPAY_WEBHOOK_SECRET'))) throw new HttpError(400, 'Invalid signature.')
    const event = JSON.parse(raw) as WebhookEvent

    const payment = event.payload?.payment?.entity
    const orderId = payment?.order_id ?? event.payload?.order?.entity?.id
    if (!orderId) return json({ ok: true, ignored: event.event })
    const pay = await paymentForOrder(orderId)
    if (!pay) return json({ ok: true, ignored: 'unknown order' })

    const paid = payment && ['payment.captured', 'payment.authorized'].includes(event.event) ? await settle(pay, payment) : await settleOrder(pay)
    return json({ ok: true, paid })
  })
}
