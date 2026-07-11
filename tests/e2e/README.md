# TeamUp e2e tests (Playwright)

Real browser end-to-end tests for the app's main flows. Unlike `tests/` (vitest —
exercises the tournament engine directly, no HTTP, no browser), this suite drives
an actual Chromium browser against a real running Next.js server.

## What's covered

- **`auth.spec.ts`** — register (player and organizer), email verification, login,
  wrong-password / unverified-email rejection, logout, forgot/reset password.
- **`tournament-lifecycle.spec.ts`** — the organizer + player flows together, the
  way they actually happen: an organizer creates a free tournament, two players
  find it and join, the organizer starts it, a player reports their own match
  result, the organizer finishes it.
- **`account.spec.ts`** — editing account details, and the Mercado Pago card's
  "not configured" state (the suite never sets real Mercado Pago credentials, so
  no real OAuth/payment flow is ever hit).

## One-time setup

```bash
yarn add -D @playwright/test   # already in package.json — run this after pulling
npx playwright install --with-deps chromium
```

## Running

```bash
yarn test:e2e           # headless, once
yarn test:e2e:ui        # Playwright's interactive UI mode (best for debugging)
yarn test:e2e:headed    # headless=false, watch the browser
```

`yarn test:e2e` starts its own `next dev` server on port **3100** and tears it
down afterwards (`reuseExistingServer` is only honoured outside CI, so a local
`yarn dev` on port 3000 is never touched).

## How it stays isolated from the real database

This project's `.env` points at a real Postgres (Supabase) instance. The e2e
suite never touches it:

- `playwright.config.ts` passes every env var the server needs directly via
  `webServer.env` (see `tests/e2e/env.ts`) — `DB_DRIVER=sqlite` and a `DB_URL`
  pointing at a dedicated `database/e2e-test.db` file. Next.js never lets a
  `.env`/`.env.local` value override an env var that's already set in the
  process, so this always wins regardless of what's in `.env`.
- `global-setup.ts` deletes that SQLite file and re-runs every migration
  against it before the suite starts, so each full run begins from a clean
  schema.
- Every spec creates its own users/tournaments through the real UI (there is
  no seeded demo data to depend on or fight over). Registration runs under the
  `club-aleman` organization/subdomain (`DEV_ORGANIZATION_DOMAIN`), the one
  test organization that allows self-registration for both roles — see
  `database/migrations/001-create-base-tables.ts`.
- No real emails are ever sent (`RESEND_API_KEY` is left unset — see
  `app/utils/email.ts`); tests read verification/password-reset tokens
  straight out of the SQLite file instead (`tests/e2e/helpers/db.ts`).
- No real Mercado Pago credentials are set, so `account.spec.ts` only exercises
  the "not configured" guard paths, never a real OAuth or payment redirect.

## Notes

- Tests run with a single worker against a single dev server + SQLite file
  (`fullyParallel: false`, `workers: 1`) to keep things deterministic. Once the
  suite is stable this can be relaxed.
- The MUI X `DatePicker` field ("Fecha de inicio") is filled by focusing it and
  typing the date digits in section order (`tests/e2e/helpers/tournament.ts`,
  `fillMuiDateField`) — `.fill()` doesn't work reliably against it.
- `test-results/` and `playwright-report/` are git-ignored; run
  `npx playwright show-report` after a run to open the HTML report.
