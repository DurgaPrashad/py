/// <reference types="node" />
/** Small helpers shared by the Vercel functions in api/. */

export class HttpError extends Error {
  readonly status: number
  /** Machine-readable reason the app reacts to (SI_REQUIRED, NOT_CONFIGURED…). */
  readonly code: string | null

  constructor(status: number, message: string, code: string | null = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Other names the same setting is often saved under (e.g. by Vercel's Supabase integration). */
const ALIASES: Record<string, string[]> = {
  DATABASE_URL: ['POSTGRES_URL', 'SUPABASE_DB_URL', 'DB_URL', 'SUPABASE_DATABASE_URL', 'POSTGRES_URL_NON_POOLING'],
  RAZORPAY_KEY_ID: ['RAZORPAY_ID', 'RAZORPAY_KEY', 'RAZORPAY_API_KEY', 'VITE_RAZORPAY_KEY_ID', 'RAZORPAY_LIVE_KEY_ID'],
  RAZORPAY_KEY_SECRET: ['RAZORPAY_SECRET', 'RAZORPAY_SECRET_KEY', 'RAZORPAY_API_SECRET', 'RAZORPAY_LIVE_KEY_SECRET'],
}

const clean = (v: string | undefined) => v?.trim().replace(/^(['"])(.*)\1$/, '$2').trim() || undefined

/** The value of an environment variable, also found when saved with different case or stray spaces. */
function lookup(name: string): string | undefined {
  const exact = clean(process.env[name])
  if (exact) return exact
  const key = Object.keys(process.env).find((k) => k.trim().toUpperCase() === name)
  return key ? clean(process.env[key]) : undefined
}

/** Server configuration from environment variables (set them in Vercel → Settings → Environment Variables). */
export function env(name: string): string | undefined {
  for (const n of [name, ...(ALIASES[name] ?? [])]) {
    const v = lookup(n)
    if (v) return v
  }
  return undefined
}

export function requireEnv(name: string): string {
  const v = env(name)
  if (!v) {
    throw new HttpError(
      503,
      `Payments aren't set up on the server yet: ${name} is missing from this deployment. Add it in Vercel → Settings → Environment Variables (Production), then redeploy. Check /api/health.`,
      'NOT_CONFIGURED',
    )
  }
  return v
}

/** Names (never values) of variables that look related — to spot typos and wrong environments. */
export function relatedEnvNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => /razorpay|database|postgres|supabase|anthropic|db_url|ai_model|ai_effort/i.test(k))
    .sort()
}

// The desktop app calls these from its own origin; requests carry a bearer token, not cookies.
export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'x-si, x-free-left',
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...headers } })
}

export const preflight = (): Response => new Response(null, { status: 204, headers: CORS })

/** Runs a handler and turns thrown errors into `{ error, code }` JSON responses. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status)
    console.error(e)
    return json({ error: 'Something went wrong on the server. Please try again.', code: null }, 500)
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new HttpError(400, 'Invalid request body.')
  }
}
