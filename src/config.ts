/** Public configuration of the hosted service. Everything here is safe to ship to browsers. */

export const PRODUCT = 'Present'
export const SITE_URL = 'https://present.waspid.com'
/** Installs the Mac app; curl downloads aren't quarantined, so it opens without Gatekeeper's warning. */
export const INSTALL_COMMAND = `curl -fsSL ${SITE_URL}/install.sh | sh`

// The publishable key only allows what the database's row-level security and
// function grants allow; secrets live server-side in Supabase Vault.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jppzpzdsotywshwbnknn.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_4CATCnaALMxUuwC4HMniVQ_aBp9kBvd'

export type Tier = 'standard' | 'si'
export type PlanId = 'standard_monthly' | 'standard_yearly' | 'si_monthly' | 'si_yearly'

export interface PlanInfo {
  id: PlanId
  tier: Tier
  interval: 'month' | 'year'
  /** US dollars; must match private.plans in the database. */
  price: number
}

export const PLANS: Record<PlanId, PlanInfo> = {
  standard_monthly: { id: 'standard_monthly', tier: 'standard', interval: 'month', price: 4 },
  standard_yearly: { id: 'standard_yearly', tier: 'standard', interval: 'year', price: 24 },
  si_monthly: { id: 'si_monthly', tier: 'si', interval: 'month', price: 9 },
  si_yearly: { id: 'si_yearly', tier: 'si', interval: 'year', price: 69 },
}

export const TIER_NAME: Record<Tier, string> = { standard: 'Standard', si: 'SI' }

/**
 * How many presentations each plan includes. Any yearly plan is unlimited.
 * Without a plan you can set up as many as the smallest plan includes, so
 * whichever plan you then buy, nothing you made is over its limit.
 */
export const PRESENTATION_LIMIT = { none: 5, standard: 5, si: 10 } as const

export const planFor = (tier: Tier, interval: 'month' | 'year'): PlanId => `${tier}_${interval === 'month' ? 'monthly' : 'yearly'}`
