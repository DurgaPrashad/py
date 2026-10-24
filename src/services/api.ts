import { SITE_URL } from '../config'
import { platform } from '../platform'
import { supabase } from './supabase'

/** An error from our api/ functions: `{ error, code }`. */
export class ApiError extends Error {
  readonly code: string | null
  readonly status: number

  constructor(message: string, code: string | null, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/** The website calls its own /api; the desktop app calls the hosted site's. */
export const apiUrl = (path: string) => (platform.kind === 'web' ? path : `${SITE_URL}${path}`)

/** fetch() to api/ with the signed-in user's token; throws ApiError on failure. */
export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  let res: Response
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    })
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", null, 0)
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string | null } | null
    throw new ApiError(body?.error ?? `Request failed (${res.status}).`, body?.code ?? null, res.status)
  }
  return res
}

export async function apiJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await api(path, body === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(body) })
  return (await res.json()) as T
}
