import { env, HttpError } from './http.js'

// Public values (the same ones the browser uses); override per environment if needed.
export const SUPABASE_URL = env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL') ?? 'https://jppzpzdsotywshwbnknn.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY =
  env('SUPABASE_PUBLISHABLE_KEY') ?? env('VITE_SUPABASE_PUBLISHABLE_KEY') ?? 'sb_publishable_4CATCnaALMxUuwC4HMniVQ_aBp9kBvd'

export interface User {
  id: string
  email: string
  token: string
}

/** The signed-in user behind the request's `Authorization: Bearer <access token>`. */
export async function requireUser(request: Request): Promise<User> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
  if (!token) throw new HttpError(401, 'Sign in first.')
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new HttpError(401, 'Your session has expired. Sign in again.')
  const user = (await res.json()) as { id: string; email?: string }
  return { id: user.id, email: user.email ?? '', token }
}

/** Calls a database function as the signed-in user (row-level security and grants apply). */
export async function rpcAsUser<T>(user: User, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const body = (await res.json().catch(() => null)) as ({ message?: string } & T) | null
  if (!res.ok) {
    const raw = body?.message ?? 'Request failed.'
    // Database errors carry a code prefix, e.g. "SI_REQUIRED: …".
    const m = /^([A-Z_]{4,}): (.*)$/s.exec(raw)
    throw new HttpError(res.status === 401 ? 401 : 403, m ? m[2] : raw, m ? m[1] : null)
  }
  return body as T
}
