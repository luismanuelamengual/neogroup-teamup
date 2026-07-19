/* eslint-disable no-console */
/**
 * Runs database migrations automatically as part of `yarn build`, but only
 * for the two branches that actually own a database:
 *
 *   - `main`    → VERCEL_ENV === 'production' (production DB)
 *   - `staging` → VERCEL_ENV === 'preview' AND VERCEL_GIT_COMMIT_REF === 'staging' (staging DB)
 *
 * This is a single-project setup: `main` deploys as Production, and
 * `staging` deploys as a Preview with its own domain (staging.teamup.ar).
 * Every *other* preview (feature branches, PRs) is also VERCEL_ENV=preview,
 * so checking VERCEL_ENV alone isn't enough to tell them apart from
 * `staging` — hence the extra VERCEL_GIT_COMMIT_REF check. Those other
 * previews are skipped: they generally don't have DB_URL configured, and
 * even if they did, we don't want every feature branch racing migrations
 * against the shared staging DB.
 *
 * Local builds (`yarn build` on a laptop) have neither variable set and are
 * skipped too. For a manual/local run against whatever DB is currently
 * configured, use `yarn db:migrate` directly.
 *
 * Requires "Automatically expose System Environment Variables" to be enabled
 * in Vercel Project Settings → Environment Variables (on by default for
 * projects created since ~2023, worth double-checking for older ones).
 */
import { execSync } from 'child_process'

const vercelEnv = process.env.VERCEL_ENV
const gitRef = process.env.VERCEL_GIT_COMMIT_REF
const shouldMigrate = vercelEnv === 'production' || (vercelEnv === 'preview' && gitRef === 'staging')

if (!shouldMigrate) {
  console.log(`Skipping automatic migrations (VERCEL_ENV=${vercelEnv ?? 'not set'}, branch=${gitRef ?? 'not set'}).`)
  process.exit(0)
}

console.log(`VERCEL_ENV=${vercelEnv} branch=${gitRef} — applying database migrations before build...`)
execSync('yarn db:migrate', { stdio: 'inherit' })
