/// <reference types="node" />
import postgres from 'postgres'
import { requireEnv } from './http.js'

let client: ReturnType<typeof postgres> | null = null

/**
 * Privileged database connection for payments (DATABASE_URL). On Vercel use
 * Supabase's transaction pooler (port 6543): serverless functions can't reach
 * the IPv6-only direct host.
 */
export function db() {
  client ??= postgres(databaseUrl(requireEnv('DATABASE_URL')), { prepare: false, max: 1, idle_timeout: 20, connect_timeout: 10 })
  return client
}

/** Accepts a password with a raw "@" (or other reserved characters) in it by encoding it. */
export function databaseUrl(raw: string): string {
  // Keep only sslmode from the query (integrations add extras such as `supa=…` the pooler rejects).
  const [base, query = ''] = raw.split('?')
  const ssl = new URLSearchParams(query).get('sslmode')
  const m = /^(postgres(?:ql)?:\/\/)([^:/@]+):(.*)@([^@]+)$/.exec(base)
  let url = base
  if (m) {
    const [, scheme, user, password, rest] = m
    const encoded = /%[0-9a-f]{2}/i.test(password) ? password : encodeURIComponent(password)
    url = `${scheme}${user}:${encoded}@${rest}`
  }
  return ssl ? `${url}?sslmode=${ssl}` : url
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
