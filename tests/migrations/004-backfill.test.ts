import { DB, Schema, SqliteDataSource } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import migration001 from '@/database/migrations/001-create-base-tables'
import migration002 from '@/database/migrations/002-competitors-player-ids'
import migration004 from '@/database/migrations/004-drop-rounds-denormalize-matches'

/**
 * Verifies migration 004's data backfill over a realistic OLD-schema database:
 * it builds the pre-004 schema (001 + 002, so the `rounds` table still exists),
 * inserts representative rounds + matches the way the old engine did, runs 004,
 * and asserts every match ends up with the right denormalised lane fields and
 * bracketInstance — the exact transformation production data will undergo.
 */

const OLD_TABLES = [
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

/** Rebuilds the pre-004 schema (rounds table present, matches with roundId/position). */
async function resetToOldSchema(): Promise<void> {
  if (!(DB.getActiveSource() instanceof SqliteDataSource)) {
    throw new Error('migration backfill test must run on throwaway SQLite')
  }

  for (const table of OLD_TABLES) {
    await DB.execute(`DROP TABLE IF EXISTS ${table}`)
  }

  await migration001.up()
  await migration002.up()
}

/** Minimal parent chain (org → owner → tournament → category) so FKs are satisfied. */
async function seedParents(): Promise<number> {
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

  return 1
}

/** Inserts an old-shape round and returns its id. RoundType: KNOCKOUT=1, KNOCKOUT_CONSOLATION=2, LEAGUE=3, AMERICANO=4. */
async function insertRound(
  tournamentCategoryId: number,
  number: number,
  type: number,
  groupNumber: number | null
): Promise<number> {
  await DB.table('rounds').insert({ tournamentCategoryId, number, type, groupNumber })
  const rows = await DB.table('rounds').select('id', 'number', 'type', 'groupNumber').get()
  const match = rows
    .filter(
      (r) =>
        Number(r.number) === number &&
        Number(r.type) === type &&
        (r.groupNumber == null ? null : Number(r.groupNumber)) === groupNumber
    )
    .map((r) => Number(r.id))

  return Math.max(...match)
}

/** Inserts an old-shape match (roundId + position). `home` tags it for later lookup. */
async function insertMatch(
  tournamentCategoryId: number,
  roundId: number,
  position: number,
  home: string,
  away: string | null
): Promise<void> {
  await DB.table('matches').insert({
    tournamentCategoryId,
    roundId,
    position,
    homeCompetitorIds: home,
    awayCompetitorIds: away
  })
}

/** Reloads every match by its `homeCompetitorIds` tag after the migration. */
async function matchByTag(): Promise<Map<string, Record<string, unknown>>> {
  const rows = await DB.table('matches')
    .select('id', 'roundNumber', 'type', 'groupNumber', 'position', 'bracketInstance', 'homeCompetitorIds')
    .get()

  return new Map(rows.map((row) => [String(row.homeCompetitorIds), row]))
}

describe('migration 004 — rounds → matches backfill', () => {
  beforeEach(async () => {
    await resetToOldSchema()
  })

  it('denormalises lane fields and sets bracketInstance, then drops the rounds table', async () => {
    const categoryId = await seedParents()
    // Main knockout bracket (4 competitors): R1 has two matches, R2 the final.
    const knockoutR1 = await insertRound(categoryId, 1, 1, null)
    const knockoutR2 = await insertRound(categoryId, 2, 1, null)

    await insertMatch(categoryId, knockoutR1, 0, '[1]', '[2]')
    await insertMatch(categoryId, knockoutR1, 1, '[3]', '[4]')
    await insertMatch(categoryId, knockoutR2, 0, '[10]', '[11]')

    // Consolation bracket single final.
    const consolationR2 = await insertRound(categoryId, 2, 2, null)

    await insertMatch(categoryId, consolationR2, 0, '[20]', '[21]')

    // A groups+playoff group lane (group index 0) and a plain americano lane.
    const groupR1 = await insertRound(categoryId, 1, 3, 0)
    const americanoR1 = await insertRound(categoryId, 1, 4, null)

    await insertMatch(categoryId, groupR1, 0, '[30]', '[31]')
    await insertMatch(categoryId, americanoR1, 0, '[40]', '[41]')

    await migration004.up()

    // The rounds table and the roundId column are gone; position is kept.
    expect(await Schema.hasTable('rounds')).toBe(false)
    expect(await Schema.hasColumn('matches', 'roundId')).toBe(false)
    expect(await Schema.hasColumn('matches', 'position')).toBe(true)

    const byTag = await matchByTag()
    const home1 = byTag.get('[1]')!
    const home3 = byTag.get('[3]')!
    const finalMatch = byTag.get('[10]')!
    const consolation = byTag.get('[20]')!
    const group = byTag.get('[30]')!
    const americano = byTag.get('[40]')!

    // Main bracket R1: type BRACKET(0), null group, roundNumber 1, position preserved.
    expect(Number(home1.type)).toBe(0)
    expect(home1.groupNumber).toBeNull()
    expect(Number(home1.roundNumber)).toBe(1)
    expect(Number(home1.position)).toBe(0)
    expect(Number(home3.position)).toBe(1)

    // A 2-round bracket: R1 is the Semifinal (instance 2), R2 is the Final (instance 1).
    expect(Number(home1.bracketInstance)).toBe(2)
    expect(Number(home3.bracketInstance)).toBe(2)
    expect(Number(finalMatch.roundNumber)).toBe(2)
    expect(Number(finalMatch.bracketInstance)).toBe(1)

    // Consolation lane maps to CONSOLATION_BRACKET(2); its single round is its final (instance 1).
    expect(Number(consolation.type)).toBe(2)
    expect(Number(consolation.bracketInstance)).toBe(1)

    // Group lane: LEAGUE(1) with its group index preserved and no bracket instance.
    expect(Number(group.type)).toBe(1)
    expect(Number(group.groupNumber)).toBe(0)
    expect(group.bracketInstance).toBeNull()

    // Americano lane also maps to the round-robin LEAGUE(1) type, no group, no instance.
    expect(Number(americano.type)).toBe(1)
    expect(americano.groupNumber).toBeNull()
    expect(americano.bracketInstance).toBeNull()
  })

  it('is idempotent (a second run is a no-op)', async () => {
    await seedParents()
    const round = await insertRound(1, 1, 3, null)

    await insertMatch(1, round, 0, '[1]', '[2]')

    await migration004.up()
    await migration004.up()

    const rows = await DB.table('matches').select('id', 'roundNumber', 'type').get()

    expect(rows.length).toBe(1)
    expect(Number(rows[0].type)).toBe(1)
  })
})
