# TeamUp tournament tests

Integration + unit tests for the tournament engine. They run the **real** models,
services and engine (`startTournament`, `setMatchResult` logic,
`progressTournamentAfterResult`, standings, champion, seeding) against a
throwaway **in-memory SQLite** database — no HTTP layer, no external Postgres.

## Layout

```
tests/
  flows/    full start→finish flows for the 6 tournament types (happy path)
  edge/     edge / border / unconventional-result cases
  unit/     pure score-validation and bracket/seeding math
  bugs/     regression tests for the 4 defects that were found & fixed
  setup/
    harness.ts          builders + setResult + flow helpers (the test API)
    vitest.setup.ts     env + SQLite binding coercion (used by Vitest)
    register.cjs        TS loader used by the no-install Node runner
    vitest-shim.ts      Vitest-compatible API for the no-install Node runner
    stubs/              inert stand-ins for next-auth / Next.js modules
  run.ts    entry point for the no-install Node runner
```

Everything is green. Read **`FINDINGS.md`** for the bugs that were found and how
they were fixed.

## Running

### With Vitest (recommended)

```bash
yarn test                 # all tests (green)
yarn test:flows           # full flows only
yarn test:edge            # edge + unit only
yarn test:regression      # only the regression suite (tests/bugs)
yarn test:watch           # watch mode
```

Configuration lives in `vitest.config.ts`. It aliases the auth/Next modules to
the stubs in `tests/setup/stubs/` (the model layer imports `app/(auth)/services/auth.ts`,
which boots NextAuth at import time and only works inside Next), and points the
ORM at in-memory SQLite via `tests/setup/vitest.setup.ts`.

### Without installing anything (Node 22+)

If you can't install Vitest, the exact same test files run through a tiny
built-in runner using only the TypeScript compiler that ships with the project:

```bash
yarn test:node                       # = node -r ./tests/setup/register.cjs tests/run.ts
yarn test:node flows/playoff         # optional path filter
```

This uses Node's built-in `node:sqlite` (Node 22+) and a small `vitest` shim, so
it needs no native build and no network.

## Notes for whoever maintains these

- **Why the SQLite binding shim?** `node:sqlite` cannot bind JS booleans or
  `Date`s, and neorm's raw query-builder UPDATEs bypass the per-column casts.
  Production runs on PostgreSQL where those types are native, so the coercion in
  `vitest.setup.ts` / `register.cjs` only affects the test DB.
- Tests share one in-memory database, so files run **serially**
  (`fileParallelism: false`) and every test starts with `resetDatabase()`.
- Underscore-prefixed files (e.g. `tests/_smoke/`, `tests/**/_*`) are scratch
  space from the authoring phase; both runners ignore them. They were emptied but
  could not be deleted from the dev sandbox — safe to `rm` at your convenience.
