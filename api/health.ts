/**
 * GET /api/health  ->  which server settings are present and working, as
 * yes/no only (never the values). Open it after changing environment
 * variables in Vercel to confirm payments and the built-in AI are ready.
 */
import { db } from './_lib/db.js'
import { env, handle, json, preflight, relatedEnvNames } from './_lib/http.js'
import { razorpay, razorpayKeys } from './_lib/razorpay.js'
import { PROJECT_REF } from './_lib/supabase.js'

export const OPTIONS = preflight

async function check(run: () => Promise<unknown>): Promise<true | string> {
  try {
    await run()
    return true
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/** The Supabase project ref in a connection string (pooler user "postgres.<ref>" or host "db.<ref>…"); not secret. */
function databaseProject(url: string | undefined): string | null {
  if (!url) return null
  return /postgres\.([a-z0-9]{10,})[:@]/.exec(url)?.[1] ?? /@db\.([a-z0-9]{10,})\./.exec(url)?.[1] ?? 'unknown'
}

export function GET(): Promise<Response> {
  return handle(async () => {
    const keys = await razorpayKeys().catch(() => null)
    const payments = {
      RAZORPAY_KEY_ID: !!env('RAZORPAY_KEY_ID'),
      RAZORPAY_KEY_SECRET: !!env('RAZORPAY_KEY_SECRET'),
      razorpay_keys_from: keys?.source ?? 'missing — set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in Vercel, or save them in Supabase Vault',
      live_mode: keys?.id.startsWith('rzp_live_') ?? false,
      razorpay_login: keys ? await check(() => razorpay('GET', '/orders?count=1')) : 'missing Razorpay keys',
      DATABASE_URL: !!env('DATABASE_URL'),
      database_connection: env('DATABASE_URL') ? await check(() => db()`select 1`) : 'missing DATABASE_URL',
      // The database must be the same Supabase project the website uses, with Present's tables in it.
      database_project: databaseProject(env('DATABASE_URL')),
      app_project: PROJECT_REF,
      database_has_present_tables: env('DATABASE_URL')
        ? await check(async () => {
            const [row] = await db()`select to_regclass('private.plans') is not null as ok`
            if (!row?.ok) throw new Error('Present’s tables are not in this database — DATABASE_URL points to another project')
          })
        : 'missing DATABASE_URL',
      RAZORPAY_WEBHOOK_SECRET: !!env('RAZORPAY_WEBHOOK_SECRET'),
    }
    const ready = payments.razorpay_login === true && payments.database_connection === true && payments.database_has_present_tables === true
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
