import postgres from 'postgres'
import { requireEnv } from './http.js'

let client: ReturnType<typeof postgres> | null = null

/**
 * Privileged database connection for payments (DATABASE_URL). On Vercel use
 * Supabase's transaction pooler (port 6543): serverless functions can't reach
 * the IPv6-only direct host.
 */
export function db() {
  client ??= postgres(requireEnv('DATABASE_URL'), { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 })
  return client
}

export interface PaymentRow {
  id: string
  user_id: string
  plan: string
  amount: number
  currency: string
  razorpay_order_id: string
  status: 'created' | 'paid'
}

export async function profileOf(userId: string) {
  const [profile] = await db()`select * from public.profiles where id = ${userId}`
  return profile ?? null
}
