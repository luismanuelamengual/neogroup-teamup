import { DB, Schema, SqliteDataSource } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import migration001 from '@/database/migrations/001-create-base-tables'
import migration002 from '@/database/migrations/002-competitors-player-ids'
import migration004 from '@/database/migrations/004-drop-rounds-denormalize-matches'
import migration005 from '@/database/migrations/005-reconcile-matches-position-instance'

/**
 * Verifies migration 005 heals a database that ran an EARLIER build of 004 (as
 * staging did) back to the final matches schema, without touching a database
 * that is already correct.
 *
 * The final schema is built with 001 + 002 + 004, a small dataset is inserted,
 * and then the table is reverse-mutated into each interim shape (bracketNumber,
 * and additionally nextMatchId) before running 005 and asserting convergence.
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

/** Builds the FINAL schema (matches with position + bracketInstance, no rounds). */
async function resetToFinalSchema(): Promise<void> {
  if (!(DB.getActiveSource() instanceof SqliteDataSource)) {
    throw new Error('migration reconcile test must run on throwaway SQLite')
  }

  for (const table of TABLES) {
    await DB.execute(`DROP TABLE IF EXISTS ${table}`)
  }

  await migration001.up()
  await migration002.up()
  await migration004.up()
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

/** Inserts a final-shape match. `home` tags it for later lookup. */
async function insertMatch(
  roundNumber: number,
  type: number,
  groupNumber: number | null,
  position: number,
  bracketInstance: number | null,
  home: string
): Promise<void> {
  await DB.table('matches').insert({
    tournamentCategoryId: 1,
    roundNumber,
    type,
    groupNumber,
    position,
    bracketInstance,
    homeCompetitorIds: home,
    awayCompetitorIds: '[99]'
  })
}

/** A 2-round main bracket (R1 = Semifinal, R2 = Final) plus one league match. */
async function seedDataset(): Promise<void> {
  await seedParents()
  await insertMatch(1, 0, null, 0, 2, '[1]') // bracket R1, pos 0, instance 2
  await insertMatch(1, 0, null, 1, 2, '[3]') // bracket R1, pos 1, instance 2
  await insertMatch(2, 0, null, 0, 1, '[10]') // bracket final, pos 0, instance 1
  await insertMatch(1, 1, null, 0, null, '[40]') // league, no instance
}

async function matchByTag(): Promise<Map<string, Record<string, unknown>>> {
  const rows = await DB.table('matches')
    .select('id', 'roundNumber', 'type', 'position', 'bracketInstance', 'homeCompetitorIds')
    .get()

  return new Map(rows.map((row) => [String(row.homeCompetitorIds), row]))
}

describe('migration 005 — reconcile interim 004 shapes', () => {
  beforeEach(async () => {
    await resetToFinalSchema()
  })

  it('renames bracketNumber back to position (staging that kept bracketInstance)', async () => {
    await seedDataset()
    // Simulate the interim 004: position was named bracketNumber.
    await DB.execute('ALTER TABLE matches RENAME COLUMN "position" TO "bracketNumber"')

    expect(await Schema.hasColumn('matches', 'position')).toBe(false)
    expect(await Schema.hasColumn('matches', 'bracketNumber')).toBe(true)

    await migration005.up()

    expect(await Schema.hasColumn('matches', 'position')).toBe(true)
    expect(await Schema.hasColumn('matches', 'bracketNumber')).toBe(false)

    const byTag = await matchByTag()

    expect(Number(byTag.get('[3]')!.position)).toBe(1)
    expect(Number(byTag.get('[3]')!.bracketInstance)).toBe(2)
    expect(Number(byTag.get('[10]')!.bracketInstance)).toBe(1)
  })

  it('renames bracketNumber AND rebuilds bracketInstance from nextMatchId (older staging)', async () => {
    await seedDataset()
    // Simulate the older interim 004: bracketNumber + a nextMatchId column, no bracketInstance.
    await DB.execute('ALTER TABLE matches RENAME COLUMN "position" TO "bracketNumber"')
    await DB.execute('ALTER TABLE matches RENAME COLUMN "bracketInstance" TO "nextMatchId"')

    expect(await Schema.hasColumn('matches', 'bracketInstance')).toBe(false)
    expect(await Schema.hasColumn('matches', 'nextMatchId')).toBe(true)

    await migration005.up()

    expect(await Schema.hasColumn('matches', 'position')).toBe(true)
    expect(await Schema.hasColumn('matches', 'bracketNumber')).toBe(false)
    expect(await Schema.hasColumn('matches', 'nextMatchId')).toBe(false)
    expect(await Schema.hasColumn('matches', 'bracketInstance')).toBe(true)

    const byTag = await matchByTag()

    // bracketInstance rebuilt from the geometry: R1 = Semifinal (2), final = 1.
    expect(Number(byTag.get('[1]')!.bracketInstance)).toBe(2)
    expect(Number(byTag.get('[3]')!.bracketInstance)).toBe(2)
    expect(Number(byTag.get('[10]')!.bracketInstance)).toBe(1)
    // The round-robin match stays without an instance.
    expect(byTag.get('[40]')!.bracketInstance).toBeNull()
  })

  it('is a no-op on the final schema', async () => {
    await seedDataset()

    await migration005.up()

    expect(await Schema.hasColumn('matches', 'position')).toBe(true)
    expect(await Schema.hasColumn('matches', 'bracketInstance')).toBe(true)
    expect(await Schema.hasColumn('matches', 'bracketNumber')).toBe(false)
    expect(await Schema.hasColumn('matches', 'nextMatchId')).toBe(false)

    const byTag = await matchByTag()

    expect(Number(byTag.get('[10]')!.bracketInstance)).toBe(1)
  })
})
