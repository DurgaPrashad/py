import { PRODUCT, type PlanId } from '../../config'
import { supabase, supabaseMessage } from '../../services/supabase'
import type { Profile } from './account'

interface CheckoutOrder {
  key_id: string
  order_id: string
  amount: number
  currency: string
  description: string
  email: string | null
  name: string | null
}

interface RazorpaySuccess {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void
}

type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance

let loading: Promise<RazorpayCtor> | null = null

function loadRazorpay(): Promise<RazorpayCtor> {
  const existing = (window as { Razorpay?: RazorpayCtor }).Razorpay
  if (existing) return Promise.resolve(existing)
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.async = true
    s.onload = () => resolve((window as unknown as { Razorpay: RazorpayCtor }).Razorpay)
    s.onerror = () => {
      loading = null
      reject(new Error('Could not load the payment window. Check your connection or disable blockers for this site.'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export type CheckoutResult = { status: 'paid'; profile: Profile } | { status: 'dismissed' }

/**
 * Creates a Razorpay order on the server, opens Razorpay Checkout, and has the
 * server verify the payment. Resolves when the plan is active or the window closes.
 */
export async function checkout(plan: PlanId): Promise<CheckoutResult> {
  const [Razorpay, order] = await Promise.all([
    loadRazorpay(),
    supabase.rpc('create_checkout', { p_plan: plan }).then(({ data, error }) => {
      if (error) throw new Error(supabaseMessage(error))
      return data as CheckoutOrder
    }),
  ])

  return new Promise<CheckoutResult>((resolve, reject) => {
    let settled = false
    const rzp = new Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: PRODUCT,
      description: order.description,
      prefill: { email: order.email ?? undefined, name: order.name ?? undefined },
      notes: { plan },
      theme: { color: '#e8650f' },
      handler: async (res: RazorpaySuccess) => {
        settled = true
        const { data, error } = await supabase.rpc('confirm_payment', {
          p_order_id: res.razorpay_order_id,
          p_payment_id: res.razorpay_payment_id,
          p_signature: res.razorpay_signature,
        })
        if (error) reject(new Error(supabaseMessage(error)))
        else resolve({ status: 'paid', profile: data as Profile })
      },
      modal: {
        ondismiss: () => {
          if (!settled) resolve({ status: 'dismissed' })
        },
      },
    })
    rzp.on('payment.failed', (r) => {
      // Checkout stays open so the customer can retry with another method.
      console.warn('Payment failed:', r.error?.description)
    })
    rzp.open()
  })
}

/** Applies payments whose confirmation didn't reach us (e.g. the tab closed). */
export async function syncPayments(): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('sync_payments')
  if (error) throw new Error(supabaseMessage(error))
  return data as Profile | null
}
