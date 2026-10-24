import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { PRESENTATION_LIMIT } from '../../config'
import { supabase, supabaseMessage } from '../../services/supabase'

/** public.profiles — one row per account. */
export interface Profile {
  id: string
  email: string
  full_name: string | null
  trial_until: string | null
  standard_until: string | null
  si_until: string | null
  /** SI yearly plan: unlocks uploading files as sources. */
  si_yearly_until: string | null
  /** Any yearly plan (Standard or SI): unlimited presentations. */
  yearly_until: string | null
  ai_answers_used: number
  created_at: string
}

export interface Payment {
  id: string
  plan: string
  amount: number
  currency: string
  status: 'created' | 'paid'
  razorpay_payment_id: string | null
  period_start: string | null
  period_end: string | null
  created_at: string
  paid_at: string | null
}

interface AccountState {
  /** The stored session has been read (signed in or not). */
  ready: boolean
  session: Session | null
  profile: Profile | null
  init(): void
  refresh(): Promise<Profile | null>
  setProfile(p: Profile): void
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, fullName: string): Promise<void>
  signOut(): Promise<void>
}

let started = false

export const useAccount = create<AccountState>((set, get) => ({
  ready: false,
  session: null,
  profile: null,

  init() {
    if (started) return
    started = true
    supabase.auth.onAuthStateChange((event, session) => {
      const prev = get().session?.user.id
      set({ session, ready: true })
      if (!session) set({ profile: null })
      // Fetch outside the auth callback (supabase-js holds a lock during it).
      else if (session.user.id !== prev || event === 'USER_UPDATED') setTimeout(() => void get().refresh(), 0)
    })
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, ready: true })
      if (data.session) void get().refresh()
    })
  },

  async refresh() {
    const user = get().session?.user
    if (!user) return null
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (error) throw new Error(supabaseMessage(error))
    const profile = data as Profile | null
    // Databases without the yearly_until column yet: work it out from the payments.
    if (profile && profile.yearly_until === undefined) {
      const { data: pays } = await supabase
        .from('payments')
        .select('period_end')
        .eq('status', 'paid')
        .in('plan', ['standard_yearly', 'si_yearly'])
        .order('period_end', { ascending: false })
        .limit(1)
      profile.yearly_until = (pays?.[0] as { period_end?: string } | undefined)?.period_end ?? null
    }
    set({ profile })
    void recoverPendingPayment(profile)
    return profile
  },

  setProfile(p) {
    set({ profile: p })
    if (p && p.yearly_until === undefined) void get().refresh().catch(() => null)
  },

  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
  },

  async signUp(email, password, fullName) {
    // Accounts are created by a database function so they can sign in at once
    // (see supabase/migrations), then we sign in normally.
    const { error } = await supabase.rpc('create_account', { p_email: email.trim(), p_password: password, p_full_name: fullName.trim() || null })
    if (error) throw new Error(supabaseMessage(error))
    await get().signIn(email, password)
  },

  async signOut() {
    await supabase.auth.signOut()
    set({ profile: null, session: null })
  },
}))

/**
 * A payment can go through while its confirmation never reaches us (the tab
 * closed mid-checkout). Once per session, if the account has a recent order
 * that isn't marked paid yet, ask the server to check it with Razorpay.
 */
let recoveryChecked = false
async function recoverPendingPayment(profile: Profile | null) {
  if (!profile || recoveryChecked) return
  recoveryChecked = true
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data } = await supabase.from('payments').select('id').eq('status', 'created').gte('created_at', since).limit(1)
  if (!data?.length) return
  try {
    const { syncPayments } = await import('./checkout')
    const synced = await syncPayments()
    if (synced) useAccount.getState().setProfile(synced)
  } catch {
    // Not reachable right now; the account page and the plan picker check again.
  }
}

const after = (iso: string | null | undefined) => (iso ? Date.parse(iso) > Date.now() : false)

/** What an account can use right now. */
export function entitlements(p: Profile | null) {
  const si = after(p?.si_until)
  const standard = si || after(p?.standard_until)
  const yearly = after(p?.yearly_until) || after(p?.si_yearly_until)
  return {
    si,
    standard,
    /** Use the app and present with the voice-following teleprompter (Standard or SI). */
    canPresent: standard,
    /** Ask the AI copilot (SI). */
    canAsk: si,
    /** Upload PDFs / documents as SI sources (SI yearly plan). */
    canUploadSources: after(p?.si_yearly_until ?? null),
    /** A yearly plan is active. */
    yearly,
    /** Presentations this account can have; null = unlimited (any yearly plan). */
    presentationLimit: yearly ? null : si ? PRESENTATION_LIMIT.si : standard ? PRESENTATION_LIMIT.standard : PRESENTATION_LIMIT.none,
    planName: si ? 'SI' : standard ? 'Standard' : 'No plan yet',
  }
}

/** "25 days left", or '' for a period with no practical end (over ten years). */
export function daysLeftLabel(iso: string | null): string {
  const n = daysLeft(iso)
  return n > 3650 ? '' : `${n} day${n === 1 ? '' : 's'} left`
}

export function daysLeft(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000))
}
