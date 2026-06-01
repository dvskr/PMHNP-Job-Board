/**
 * _pd-env.ts — shared env loader for the PD campaign scripts.
 *
 * Default: points DATABASE_URL at PRODUCTION (sggccmqjzuimwlahocmy)
 * because the real campaign reads/writes prod. Webhook delivery,
 * shortlink_clicks, the admin panel — all live in prod.
 *
 * Pass `--dev` (or set PD_ENV=dev) to point at the dev DB instead —
 * useful for testing schema changes or for `send-pd-wave --to=<my-email>`
 * smoke-tests where you don't want to update prod lead state.
 *
 *   import { loadPdEnv } from './_pd-env'
 *   loadPdEnv()  // call BEFORE any '@/lib/prisma' import
 *
 * Loads in this order:
 *   1. .env.local        — local-only secrets (Resend API key, Postmark token, etc.)
 *   2. .env              — defaults
 *   3. .env.prod         — PROD_DATABASE_URL + RESEND_WEBHOOK_SECRET + etc.
 *
 * Then aliases PROD_DATABASE_URL → DATABASE_URL (unless --dev mode).
 */
import { config as dotenvConfig } from 'dotenv'

export function loadPdEnv(): { env: 'prod' | 'dev'; hostname: string } {
  // Load all three env files. dotenv default = don't override already-set
  // vars, so .env.local wins for shared keys. That's the right default
  // for non-DB secrets (RESEND_API_KEY, BEEHIIV_API, etc.) — the local
  // copies are the canonical ones.
  dotenvConfig({ path: '.env.local' })
  dotenvConfig({ path: '.env' })
  dotenvConfig({ path: '.env.prod' })

  // Determine env target:
  //   --dev flag → DEV (keep DATABASE_URL from .env.local)
  //   default    → PROD (override DATABASE_URL with PROD_DATABASE_URL)
  const isDev = process.argv.includes('--dev') || process.env.PD_ENV === 'dev'

  if (!isDev) {
    if (!process.env.PROD_DATABASE_URL) {
      throw new Error(
        '[pd-env] PROD_DATABASE_URL not found in .env.prod — cannot run script against prod. ' +
          'Either set PROD_DATABASE_URL in .env.prod or pass --dev to run against the local dev DB.',
      )
    }
    process.env.DATABASE_URL = process.env.PROD_DATABASE_URL
    process.env.DIRECT_URL =
      process.env.PROD_DIRECT_DATABASE_URL ?? process.env.PROD_DATABASE_URL
  }

  const hostname =
    process.env.DATABASE_URL?.match(/@([^:/?]+)/)?.[1] ?? '(unknown)'

  console.log(
    `[pd-env] target=${isDev ? 'DEV' : 'PROD'} host=${hostname}` +
      (isDev ? ' (passed --dev flag)' : ''),
  )

  return { env: isDev ? 'dev' : 'prod', hostname }
}
