/* eslint-disable */
/**
 * Vitest global setup. Runs once before the test files, on a laptop AND in CI /
 * build environments alike (e.g. Vercel, which injects the project's real
 * DB_URL / DB_DRIVER as build-time env vars). It:
 *   1. FORCES the ORM onto a throwaway in-memory SQLite database, unconditionally
 *      — never a fallback default. The test suite runs destructive operations
 *      (resetDatabase() drops core tables between every test), so it must never
 *      be able to attach to whatever real Postgres happens to be configured in
 *      the environment. See the incident this guards against: a Vercel build
 *      inherited the production DB_URL and the test run dropped tables in it.
 *   2. coerces SQLite bindings (boolean → 0/1, Date → ISO) at the driver
 *      boundary, because node:sqlite cannot bind those types and neorm's raw
 *      query-builder UPDATEs bypass the per-column casts. Production runs on
 *      PostgreSQL where these types are native, so this only affects the tests.
 *
 * The Next.js / next-auth import side effects are handled by the resolve.alias
 * entries in vitest.config.ts, not here.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { DB, SqliteDataSource } from '@neogroup/neorm'

// Overwrite (not `||=`) — any DB_URL/DB_DRIVER already present in the
// environment (production credentials on a CI/build machine, a developer's
// shell, etc.) must never leak into the test run.
process.env.DB_DRIVER = 'sqlite'
process.env.DB_URL = 'sqlite://:memory:'

// Belt and suspenders: register the SQLite source directly instead of relying
// on neorm's lazy env-var configuration. This wins regardless of import order
// or of anything else in the process having already configured a source from
// the (real) environment before this file ran.
;(globalThis as any).__neorm = { sources: new Map(), activeSourceName: undefined }
DB.register(new SqliteDataSource())

const require = createRequire(import.meta.url)

function coerceBinding(value: unknown): unknown {
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (value === undefined) {
    return null
  }

  return value
}

try {
  const sqlitePath = path.join(
    process.cwd(),
    'node_modules',
    '@neogroup',
    'neorm',
    'dist',
    'database',
    'sources',
    'sqlite',
    'SqliteConnection.js'
  )
  const { SqliteConnection } = require(sqlitePath)
  const wrap = (method: 'query' | 'execute') => {
    const original = SqliteConnection.prototype[method]

    SqliteConnection.prototype[method] = function (sql: string, bindings: unknown[]) {
      return original.call(this, sql, Array.isArray(bindings) ? bindings.map(coerceBinding) : bindings)
    }
  }

  wrap('query')
  wrap('execute')
} catch {
  // Not running on SQLite — nothing to coerce.
}
