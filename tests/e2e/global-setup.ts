import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { E2E_DB_PATH, E2E_SERVER_ENV } from './env'

const ROOT = path.resolve(__dirname, '..', '..')

/**
 * Runs once before the whole e2e suite (and before the Playwright webServer
 * is considered ready — see `playwright.config.ts`).
 *
 * Resets the dedicated e2e SQLite database to a clean, fully-migrated state:
 *   1. deletes any leftover file from a previous run
 *   2. re-runs every migration in database/migrations against it
 *
 * Every spec then builds its own data (organizer, players, tournaments)
 * through the real UI/API, so the suite never depends on — or fights over —
 * pre-seeded rows.
 */
export default function globalSetup(): void {
  if (existsSync(E2E_DB_PATH)) {
    rmSync(E2E_DB_PATH)
  }

  const tsxBin = path.resolve(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx')

  execFileSync(tsxBin, ['scripts/migrate-database.ts'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...E2E_SERVER_ENV }
  })
}
