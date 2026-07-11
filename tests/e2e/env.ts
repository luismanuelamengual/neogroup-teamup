import path from 'node:path'

/**
 * Shared configuration for the Playwright e2e suite. Imported by both
 * `playwright.config.ts` (to start the dev server) and `global-setup.ts`
 * (to reset/migrate the database before the server boots), so the two never
 * drift apart.
 *
 * The suite never touches the real database configured in `.env`/`.env.local`
 * (which, in this project, is a real Supabase Postgres instance): every value
 * below is passed explicitly as process env to the Next.js child process, and
 * Next.js never overrides an already-set env var with one from a `.env` file.
 */

export const E2E_PORT = 3100
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`

/** Dedicated SQLite file, separate from the one used for local dev (`database/local.db`). */
export const E2E_DB_PATH = path.resolve(__dirname, '..', '..', 'database', 'e2e-test.db')

/**
 * Organization the e2e suite runs under. Unlike "demo" (self-registration
 * disabled) and "punto-deporte" (players only), "club-aleman" allows both
 * roles to self-register (see database/migrations/001-create-base-tables.ts),
 * which is what the auth flows need to exercise. It also starts out empty on
 * a freshly migrated database, so every spec creates its own users through
 * the real registration flow instead of depending on seeded demo data.
 */
export const E2E_ORGANIZATION_DOMAIN = 'club-aleman'

/**
 * Env vars for the Next.js server under test. Deliberately leaves
 * RESEND_API_KEY and MP_CLIENT_ID/MP_CLIENT_SECRET unset: emails are skipped
 * (see app/utils/email.ts) and tests read tokens straight from the database
 * instead, and Mercado Pago stays "not configured" so no real OAuth/payment
 * flow is ever hit.
 */
export const E2E_SERVER_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  PORT: String(E2E_PORT),
  NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
  DEV_ORGANIZATION_DOMAIN: E2E_ORGANIZATION_DOMAIN,
  AUTH_SECRET: 'e2e-test-secret-do-not-use-in-production',
  AUTH_SESSION_MAX_AGE: '86400',
  DB_DRIVER: 'sqlite',
  DB_URL: `sqlite://${E2E_DB_PATH}`,
  RESEND_FROM_EMAIL: 'TeamUp <noreply@teamup.ar>',
  RESEND_API_KEY: '',
  MP_CLIENT_ID: '',
  MP_CLIENT_SECRET: '',
  NEXT_PUBLIC_GTM_ID: ''
}
