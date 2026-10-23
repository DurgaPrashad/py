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

/** Message of a Supabase / PostgREST error, minus our internal error-code prefixes. */
export function supabaseMessage(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  return msg.replace(/^[A-Z_]+: /, '')
}

/** Our database functions prefix some errors with a code, e.g. `SI_REQUIRED: …`. */
export function supabaseCode(e: unknown): string | null {
  const m = /^([A-Z_]{4,}): /.exec((e as { message?: string })?.message ?? '')
  return m ? m[1] : null
}
