import { DB, Schema } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import migration013 from '@/database/migrations/013-matches-schedule'
import { buildTournament, createSite, getAllMatches, resetDatabase, start } from '@/tests/setup/harness'

/**
 * Migration 013 adds the four scheduling columns to `matches`. It is a plain
 * additive migration, so what is worth pinning down is that the columns exist,
 * that they accept the string shapes the app stores ('YYYY-MM-DD' / 'HH:mm')
 * without any coercion, and that replaying it is harmless.
 *
 * `resetDatabase()` already applies it, so the pre-migration shape is recreated
 * by dropping the columns again.
 */
const SCHEDULE_COLUMNS = ['siteId', 'date', 'hour', 'courtNumber']

async function dropScheduleColumns(): Promise<void> {
  await Schema.table('matches', (table) => {
    table.dropColumn(SCHEDULE_COLUMNS)
  })
}

/**
 * Id of a real match. Matches hold a foreign key to their category instance, so
 * they cannot be conjured with a raw insert — the tournament is built through
 * the harness and started, which is what materialises round 1.
 */
async function createMatch(): Promise<number> {
  const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 4 })

  await start(built)

  const matches = await getAllMatches(built.categoryIds[0]!)

  return matches[0]!.id
}

describe('migration 013 — match scheduling columns', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('adds the four scheduling columns, all nullable', async () => {
    await dropScheduleColumns()

    for (const column of SCHEDULE_COLUMNS) {
      expect(await Schema.hasColumn('matches', column)).toBe(false)
    }

    await migration013.up()

    for (const column of SCHEDULE_COLUMNS) {
      expect(await Schema.hasColumn('matches', column)).toBe(true)
    }
  })

  it('is idempotent (a second run is a no-op)', async () => {
    await expect(migration013.up()).resolves.not.toThrow()
    await expect(migration013.up()).resolves.not.toThrow()

    for (const column of SCHEDULE_COLUMNS) {
      expect(await Schema.hasColumn('matches', column)).toBe(true)
    }
  })

  it('stores the date and hour verbatim, with no timezone coercion', async () => {
    const matchId = await createMatch()
    const siteId = await createSite(1, 'Club Belgrano')

    await DB.table('matches').where('id', matchId).update({ siteId, date: '2026-08-12', hour: '18:30', courtNumber: 3 })

    const row = await DB.table('matches').select('siteId', 'date', 'hour', 'courtNumber').where('id', matchId).first()

    // The exact strings that went in must come back out: a match date is a
    // wall-clock value at the venue, so a shift here would move real matches to
    // the wrong day (see the migration's own comment).
    expect(row!.date).toBe('2026-08-12')
    expect(row!.hour).toBe('18:30')
    expect(Number(row!.siteId)).toBe(siteId)
    expect(Number(row!.courtNumber)).toBe(3)
  })

  it('leaves the columns empty on a match that was never scheduled', async () => {
    const matchId = await createMatch()
    const row = await DB.table('matches')
      .select(...SCHEDULE_COLUMNS)
      .where('id', matchId)
      .first()

    for (const column of SCHEDULE_COLUMNS) {
      expect(row![column] ?? null).toBeNull()
    }
  })
})
