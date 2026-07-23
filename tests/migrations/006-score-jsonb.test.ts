import { DB, SqliteDataSource } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import migration001 from '@/database/migrations/001-create-base-tables'
import migration002 from '@/database/migrations/002-competitors-player-ids'
import migration004 from '@/database/migrations/004-drop-rounds-denormalize-matches'
import migration005 from '@/database/migrations/005-reconcile-matches-position-instance'
import migration006 from '@/database/migrations/006-matches-score-jsonb'

/**
 * Verifies migration 006 converts the legacy `"{format}:{body}"` score string
 * into the equivalent structured JSON object, in place, without touching
 * pending matches (score = null) or non-legacy rows.
 */

const TABLES = [
  'tournament_payments',
  'matches',
  'rounds',
  'competitors',
  'tournament_categories',
  'tournaments',
  'rankings',
  'player_statistics',
  'organization_statistics',
  'categories',
  'mercadopago_accounts',
  'password_reset_tokens',
  'email_verification_tokens',
  'users',
  'organizations',
  'migrations'
]

/** Builds the schema as of migration 005 (TEXT score), before 006 runs. */
async function resetToPreJsonbSchema(): Promise<void> {
  if (!(DB.getActiveSource() instanceof SqliteDataSource)) {
    throw new Error('migration score-jsonb test must run on throwaway SQLite')
  }

  for (const table of TABLES) {
    await DB.execute(`DROP TABLE IF EXISTS ${table}`)
  }

  await migration001.up()
  await migration002.up()
  await migration004.up()
  await migration005.up()
}

async function seedParents(): Promise<void> {
  await DB.table('organizations').insert({ name: 'Org', domainName: 'org', createdAt: new Date().toISOString() })
  await DB.table('users').insert({ organizationId: 1, email: 'o@o.dev', createdAt: new Date().toISOString() })
  await DB.table('tournaments').insert({
    organizationId: 1,
    ownerId: 1,
    name: 'T',
    status: 2,
    discipline: 1,
    type: 1,
    scoreFormat: 1,
    startDate: '2026-01-01',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  await DB.table('tournament_categories').insert({ tournamentId: 1, categoryId: null, maxCompetitors: 16 })
}

/** Inserts a final-shape match with a legacy TEXT `score`. `home` tags it for later lookup. */
async function insertMatch(home: string, away: string | null, score: string | null): Promise<void> {
  await DB.table('matches').insert({
    tournamentCategoryId: 1,
    roundNumber: 1,
    type: 1,
    groupNumber: null,
    position: 0,
    bracketInstance: null,
    homeCompetitorIds: home,
    awayCompetitorIds: away,
    score
  })
}

async function matchByTag(): Promise<Map<string, Record<string, unknown>>> {
  const rows = await DB.table('matches').select('homeCompetitorIds', 'score').get()

  return new Map(rows.map((row) => [String(row.homeCompetitorIds), row]))
}

/** Parses whatever the raw `score` column value is (JSON string on SQLite) into an object. */
function parseStoredScore(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value
}

describe('migration 006 — matches.score TEXT → JSONB', () => {
  beforeEach(async () => {
    await resetToPreJsonbSchema()
  })

  it('converts THREE_SETS, BASIC_COUNT and walkover strings into structured objects', async () => {
    await seedParents()
    await insertMatch('[1]', '[2]', '1:6-2|6-4')
    await insertMatch('[3]', '[4]', '3:14-5')
    await insertMatch('[5]', '[6]', '1:wo1')
    await insertMatch('[7]', '[8]', '2:6-1|6-7|13-11')
    await insertMatch('[9]', null, null) // pending match, no score yet

    await migration006.up()

    const byTag = await matchByTag()

    expect(parseStoredScore(byTag.get('[1]')!.score)).toEqual({
      sets: [
        { home: 6, away: 2 },
        { home: 6, away: 4 }
      ]
    })
    expect(parseStoredScore(byTag.get('[3]')!.score)).toEqual({ home: 14, away: 5 })
    expect(parseStoredScore(byTag.get('[5]')!.score)).toEqual({ walkover: 1 })
    expect(parseStoredScore(byTag.get('[7]')!.score)).toEqual({
      sets: [
        { home: 6, away: 1 },
        { home: 6, away: 7 },
        { home: 13, away: 11 }
      ]
    })
    expect(byTag.get('[9]')!.score).toBeNull()
  })

  it('is idempotent (a second run is a no-op)', async () => {
    await seedParents()
    await insertMatch('[1]', '[2]', '1:6-2|6-4')

    await migration006.up()
    await migration006.up()

    const byTag = await matchByTag()

    expect(parseStoredScore(byTag.get('[1]')!.score)).toEqual({
      sets: [
        { home: 6, away: 2 },
        { home: 6, away: 4 }
      ]
    })
  })

  it('is a no-op on a table with no matches at all', async () => {
    await seedParents()

    await expect(migration006.up()).resolves.not.toThrow()

    const rows = await DB.table('matches').get()

    expect(rows.length).toBe(0)
  })
})
