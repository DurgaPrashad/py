import { createClient } from '@supabase/supabase-js'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: 'reflex.auth',
    persistSession: true,
    autoRefreshToken: true,
    // Password-reset links land on /reset with the session in the URL.
    detectSessionInUrl: true,
  },
})

/** Shown when the account service doesn't answer: no connection, or the project is paused. */
export const UNREACHABLE = 'Can’t reach the Present account service right now. Please try again in a minute.'

/** True when an error means the account service couldn't be reached at all. */
export function isUnreachable(e: unknown): boolean {
  const msg = (e as { message?: string })?.message ?? String(e)
  const name = (e as { name?: string })?.name ?? ''
  return msg === UNREACHABLE || name === 'AuthRetryableFetchError' || /failed to fetch|load failed|networkerror|fetch failed|network request failed/i.test(msg)
}

/** Message of a Supabase / PostgREST error, minus our internal error-code prefixes. */
export function supabaseMessage(e: unknown): string {
  if (isUnreachable(e)) return UNREACHABLE
  const msg = (e as { message?: string })?.message ?? String(e)
  return msg.replace(/^[A-Z_]+: /, '')
}

/** Our database functions prefix some errors with a code, e.g. `SI_REQUIRED: …`. */
export function supabaseCode(e: unknown): string | null {
  const m = /^([A-Z_]{4,}): /.exec((e as { message?: string })?.message ?? '')
  return m ? m[1] : null
}
