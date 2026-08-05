import { DB, Schema, SqliteDataSource } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import migration001 from '@/database/migrations/001-create-base-tables'
import migration002 from '@/database/migrations/002-competitors-player-ids'
import migration003 from '@/database/migrations/003-tournament-images'
import migration004 from '@/database/migrations/004-drop-rounds-denormalize-matches'
import migration005 from '@/database/migrations/005-reconcile-matches-position-instance'
import migration006 from '@/database/migrations/006-matches-score-jsonb'
import migration008 from '@/database/migrations/008-sites'
import migration009 from '@/database/migrations/009-interclubs'
import migration010 from '@/database/migrations/010-categories-drop-subdiscipline'
import migration011 from '@/database/migrations/011-organizations-enabled-disciplines'
import migration012 from '@/database/migrations/012-tournaments-allow-player-set-score'
import migration013 from '@/database/migrations/013-matches-schedule'
import migration014 from '@/database/migrations/014-tournaments-start-inscriptions-date'
import migration015 from '@/database/migrations/015-payments-refactor'
import migration016 from '@/database/migrations/016-fold-playoff-consolation-into-playoff'
import migration018 from '@/database/migrations/018-single-competitor-per-side'

/**
 * Verifies migration 018 over a realistic pre-018 database: matches still hold
 * `homeCompetitorIds`/`awayCompetitorIds` arrays, and a row of the old
 * AMERICANO_WITH_SWAP type (6, removed from TournamentType) exists with
 * 2-competitor sides — exactly the shape production/staging data has before
 * this migration runs.
 */

const OLD_TABLES = [
  'service_payments',
  'tournament_payments',
  'tournament_images',
  'matches',
  'rounds',
  'competitors',
  'tournament_categories',
  'tournaments',
  'sites',
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
const OLD_AMERICANO_WITH_SWAP_TYPE = 6
const LEAGUE_TYPE = 1
const PLAYOFF_TYPE = 3

/** Rebuilds the pre-018 schema (matches still has the array columns). */
async function resetToOldSchema(): Promise<void> {
  if (!(DB.getActiveSource() instanceof SqliteDataSource)) {
    throw new Error('migration 018 test must run on throwaway SQLite')
  }

  for (const table of OLD_TABLES) {
    await DB.execute(`DROP TABLE IF EXISTS ${table}`)
  }

  await migration001.up()
  await migration002.up()
  await migration003.up()
  await migration004.up()
  await migration005.up()
  await migration006.up()
  await migration008.up()
  await migration009.up()
  await migration010.up()
  await migration011.up()
  await migration012.up()
  await migration013.up()
  await migration014.up()
  await migration015.up()
  await migration016.up()
}

/** Creates a tournament + single category, returns their ids. */
async function seedTournament(type: number): Promise<{ tournamentId: number; categoryId: number }> {
  await DB.table('organizations').insert({ name: 'Org', domainName: `org-${Date.now()}`, createdAt: new Date() })
  const organizationId = (await DB.table('organizations').select('id').orderByDesc('id').first())!.id as number

  await DB.table('users').insert({
    organizationId,
    email: `o-${Date.now()}-${Math.random()}@o.dev`,
    createdAt: new Date()
  })
  const ownerId = (await DB.table('users').select('id').orderByDesc('id').first())!.id as number

  await DB.table('tournaments').insert({
    organizationId,
    ownerId,
    name: 'T',
    status: 2,
    discipline: 1,
    type,
    scoreFormat: 1,
    startDate: '2026-01-01',
    createdAt: new Date(),
    updatedAt: new Date()
  })
  const tournamentId = (await DB.table('tournaments').select('id').orderByDesc('id').first())!.id as number

  await DB.table('tournament_categories').insert({ tournamentId, categoryId: null, maxCompetitors: 16 })
  const categoryId = (await DB.table('tournament_categories').select('id').orderByDesc('id').first())!.id as number

  return { tournamentId, categoryId }
}

async function insertCompetitor(tournamentCategoryId: number): Promise<number> {
  await DB.table('competitors').insert({ tournamentCategoryId, playerIds: '[1]', createdAt: new Date() })

  return (await DB.table('competitors').select('id').orderByDesc('id').first())!.id as number
}

async function insertMatch(tournamentCategoryId: number, home: string, away: string | null, status = 1): Promise<void> {
  await DB.table('matches').insert({
    tournamentCategoryId,
    roundNumber: 1,
    type: 1,
    position: 0,
    homeCompetitorIds: home,
    awayCompetitorIds: away,
    status,
    createdAt: new Date(),
    updatedAt: new Date()
  })
}

describe('migration 018 — single competitor per side', () => {
  beforeEach(async () => {
    await resetToOldSchema()
  })

  it('deletes every AMERICANO_WITH_SWAP tournament and everything under it', async () => {
    const { categoryId } = await seedTournament(OLD_AMERICANO_WITH_SWAP_TYPE)
    const c1 = await insertCompetitor(categoryId)
    const c2 = await insertCompetitor(categoryId)

    await insertMatch(categoryId, `[${c1},${c2}]`, `[${c1},${c2}]`)

    const { tournamentId: keptTournamentId, categoryId: keptCategoryId } = await seedTournament(LEAGUE_TYPE)
    const keptHome = await insertCompetitor(keptCategoryId)
    const keptAway = await insertCompetitor(keptCategoryId)

    await insertMatch(keptCategoryId, `[${keptHome}]`, `[${keptAway}]`)

    await migration018.up()

    expect(await DB.table('tournaments').where('type', OLD_AMERICANO_WITH_SWAP_TYPE).get()).toEqual([])
    expect(await DB.table('tournament_categories').where('id', categoryId).get()).toEqual([])
    expect(await DB.table('competitors').whereIn('id', [c1, c2]).get()).toEqual([])
    expect((await DB.table('matches').where('tournamentCategoryId', categoryId).get()).length).toBe(0)

    // The unrelated LEAGUE tournament is untouched.
    expect((await DB.table('tournaments').where('id', keptTournamentId).get()).length).toBe(1)

    const keptMatch = (await DB.table('matches').where('tournamentCategoryId', keptCategoryId).first())!

    expect(Number(keptMatch.homeCompetitorId)).toBe(keptHome)
    expect(Number(keptMatch.awayCompetitorId)).toBe(keptAway)
  })

  it('backfills homeCompetitorId/awayCompetitorId from the old arrays, including byes and TBD placeholders', async () => {
    const { categoryId } = await seedTournament(PLAYOFF_TYPE)
    const home = await insertCompetitor(categoryId)
    const away = await insertCompetitor(categoryId)
    const byeOccupant = await insertCompetitor(categoryId)

    // A resolved real match.
    await insertMatch(categoryId, `[${home}]`, `[${away}]`, 3)
    // A round-1 bye: away is null (not an empty array), status WALKOVER (4 in MatchStatus).
    await insertMatch(categoryId, `[${byeOccupant}]`, null, 4)
    // A "to be defined" knockout placeholder: both sides are empty arrays, still PENDING.
    await insertMatch(categoryId, '[]', '[]', 1)

    await migration018.up()

    const rows = await DB.table('matches')
      .select('homeCompetitorId', 'awayCompetitorId', 'status')
      .where('tournamentCategoryId', categoryId)
      .orderBy('status')
      .get()
    const byStatus = new Map(rows.map((row) => [Number(row.status), row]))

    // status 1 = PENDING → the TBD placeholder: both sides unknown.
    expect(byStatus.get(1)!.homeCompetitorId).toBeNull()
    expect(byStatus.get(1)!.awayCompetitorId).toBeNull()

    // status 3 = PLAYED → the real match: both sides resolved to their single id.
    expect(Number(byStatus.get(3)!.homeCompetitorId)).toBe(home)
    expect(Number(byStatus.get(3)!.awayCompetitorId)).toBe(away)

    // status 4 = WALKOVER → the bye: home known, away permanently null.
    expect(Number(byStatus.get(4)!.homeCompetitorId)).toBe(byeOccupant)
    expect(byStatus.get(4)!.awayCompetitorId).toBeNull()
  })

  it('drops the old array columns and adds the new scalar ones', async () => {
    await migration018.up()

    expect(await Schema.hasColumn('matches', 'homeCompetitorIds')).toBe(false)
    expect(await Schema.hasColumn('matches', 'awayCompetitorIds')).toBe(false)
    expect(await Schema.hasColumn('matches', 'homeCompetitorId')).toBe(true)
    expect(await Schema.hasColumn('matches', 'awayCompetitorId')).toBe(true)
  })

  it('is idempotent (a second run is a no-op)', async () => {
    const { categoryId } = await seedTournament(LEAGUE_TYPE)
    const home = await insertCompetitor(categoryId)
    const away = await insertCompetitor(categoryId)

    await insertMatch(categoryId, `[${home}]`, `[${away}]`, 3)

    await migration018.up()
    await expect(migration018.up()).resolves.not.toThrow()

    const match = (await DB.table('matches').where('tournamentCategoryId', categoryId).first())!

    expect(Number(match.homeCompetitorId)).toBe(home)
    expect(Number(match.awayCompetitorId)).toBe(away)
  })
})
