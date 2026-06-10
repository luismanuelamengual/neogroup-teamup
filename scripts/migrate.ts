/**
 * Database migrations runner.
 *
 * Applies every migration found in /database/migrations (sorted by file name)
 * that has not been applied yet. Applied migrations are tracked in the
 * `migrations` table.
 *
 * Usage: npm run db:migrate
 */
import { config } from 'dotenv'
import { readdirSync } from 'fs'
import { join } from 'path'

config({ path: '.env.local' })
config({ path: '.env' })

import { DB } from '@neogroup/neorm'

interface Migration {
  name: string
  up: () => Promise<void>
}

const MIGRATIONS_DIR = join(__dirname, '..', 'database', 'migrations')

async function ensureMigrationsTable(): Promise<void> {
  await DB.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const rows = await DB.table('migrations').select('name').get()

  return new Set(rows.map((row: { name: string }) => row.name))
}

async function loadMigrations(): Promise<Migration[]> {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
    .sort()

  const migrations: Migration[] = []

  for (const file of files) {
    const module = await import(join(MIGRATIONS_DIR, file))
    const migration: Migration = module.default

    if (!migration?.name || typeof migration.up !== 'function') {
      throw new Error(`Invalid migration file: ${file}`)
    }

    migrations.push(migration)
  }

  return migrations
}

async function run(): Promise<void> {
  await ensureMigrationsTable()

  const applied = await getAppliedMigrations()
  const migrations = await loadMigrations()
  let executed = 0

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      continue
    }

    console.log(`Applying migration: ${migration.name}`)
    await migration.up()
    await DB.table('migrations').insert({ name: migration.name })
    executed++
  }

  console.log(executed > 0 ? `Done. ${executed} migration(s) applied.` : 'Database is up to date.')
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error)
    process.exit(1)
  })
