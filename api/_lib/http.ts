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

/** Server configuration from environment variables (set them in Vercel → Settings → Environment Variables). */
export function env(name: string): string | undefined {
  const v = process.env[name]?.trim()
  return v ? v : undefined
}

export function requireEnv(name: string): string {
  const v = env(name)
  if (!v) throw new HttpError(503, `The server is missing ${name}. Add it in Vercel → Settings → Environment Variables and redeploy.`, 'NOT_CONFIGURED')
  return v
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
