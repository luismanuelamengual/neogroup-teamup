/* eslint-disable */
/**
 * Vitest global setup. Runs once before the test files on a normal machine
 * (`yarn vitest`). It:
 *   1. points the ORM at a throwaway in-memory SQLite database, and
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

process.env.DB_DRIVER = process.env.DB_DRIVER || 'sqlite'
process.env.DB_URL = process.env.DB_URL || 'sqlite://:memory:'

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
