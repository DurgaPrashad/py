/**
 * GET /api/health  ->  which server settings are present and working, as
 * yes/no only (never the values). Open it after changing environment
 * variables in Vercel to confirm payments and the built-in AI are ready.
 */
import { db } from './_lib/db.js'
import { env, handle, json, preflight, relatedEnvNames } from './_lib/http.js'
import { razorpay } from './_lib/razorpay.js'

export const OPTIONS = preflight

async function check(run: () => Promise<unknown>): Promise<true | string> {
  try {
    await run()
    return true
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export function GET(): Promise<Response> {
  return handle(async () => {
    const keyId = env('RAZORPAY_KEY_ID')
    const razorpayReady = !!keyId && !!env('RAZORPAY_KEY_SECRET')
    const payments = {
      RAZORPAY_KEY_ID: !!keyId,
      RAZORPAY_KEY_SECRET: !!env('RAZORPAY_KEY_SECRET'),
      live_mode: keyId?.startsWith('rzp_live_') ?? false,
      razorpay_login: razorpayReady ? await check(() => razorpay('GET', '/orders?count=1')) : 'missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET',
      DATABASE_URL: !!env('DATABASE_URL'),
      database_connection: env('DATABASE_URL') ? await check(() => db()`select 1`) : 'missing DATABASE_URL',
      RAZORPAY_WEBHOOK_SECRET: !!env('RAZORPAY_WEBHOOK_SECRET'),
    }
    const ready = payments.razorpay_login === true && payments.database_connection === true
    return json({
      payments_ready: ready,
      // Which deployment answered: variables only apply to deployments made after they were saved.
      deployment: {
        environment: env('VERCEL_ENV') ?? 'local',
        commit: env('VERCEL_GIT_COMMIT_SHA')?.slice(0, 7) ?? null,
        related_variable_names: relatedEnvNames(),
      },
      payments,
      built_in_ai: { ANTHROPIC_API_KEY: !!env('ANTHROPIC_API_KEY'), model: env('AI_MODEL') ?? 'claude-opus-5-5' },
    })
  })
}
