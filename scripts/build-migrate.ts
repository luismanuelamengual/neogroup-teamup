/* eslint-disable no-console */
/**
 * Runs database migrations automatically as part of `yarn build`, but only
 * for a real Vercel Production deployment — i.e. a push to whichever branch
 * is configured as a project's "Production Branch" (VERCEL_ENV === 'production').
 *
 * This intentionally skips:
 *   - Local builds (`yarn build` on a laptop) — VERCEL_ENV is unset
 *
 * so schema changes only ever get applied automatically to the DB that a
 * project's own Production environment variables point to (production DB for
 * the main project, staging DB for the staging project). For a manual/local
 * run against whatever DB is currently configured, use `yarn db:migrate`
 * directly.
 *
 * Requires "Automatically expose System Environment Variables" to be enabled
 * in Vercel Project Settings → Environment Variables (on by default for
 * projects created since ~2023, worth double-checking for older ones).
 */
import { execSync } from 'child_process'

const vercelEnv = process.env.VERCEL_ENV

if (!vercelEnv) {
  console.log(`Skipping automatic migrations (VERCEL_ENV=${vercelEnv ?? 'not set'}).`)
  process.exit(0)
}

console.log('VERCEL_ENV=production — applying database migrations before build...')
execSync('yarn db:migrate', { stdio: 'inherit' })
