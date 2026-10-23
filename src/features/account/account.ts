import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { FREE_AI_ANSWERS } from '../../config'
import { supabase, supabaseMessage } from '../../services/supabase'

/** public.profiles — one row per account. */
export interface Profile {
  id: string
  email: string
  full_name: string | null
  trial_until: string | null
  standard_until: string | null
  si_until: string | null
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
    set({ profile: data as Profile | null })
    return data as Profile | null
  },

  setProfile(p) {
    set({ profile: p })
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

const after = (iso: string | null) => (iso ? Date.parse(iso) > Date.now() : false)

/** What an account can use right now. */
export function entitlements(p: Profile | null) {
  const si = after(p?.si_until ?? null)
  const standard = si || after(p?.standard_until ?? null)
  const trial = !standard && after(p?.trial_until ?? null)
  const freeAnswersLeft = si ? Infinity : Math.max(0, FREE_AI_ANSWERS - (p?.ai_answers_used ?? 0))
  return {
    si,
    standard,
    trial,
    /** Present with the voice-following teleprompter. */
    canPresent: standard || trial,
    /** Ask the AI copilot (SI, or the free SI answers). */
    canAsk: si || freeAnswersLeft > 0,
    freeAnswersLeft,
    planName: si ? 'SI' : standard ? 'Standard' : trial ? 'Free trial' : 'No active plan',
  }
}

export function daysLeft(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000))
}
