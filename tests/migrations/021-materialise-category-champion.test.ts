import { DB, Schema } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import migration021 from '@/database/migrations/021-materialise-category-champion'
import { buildTournament, playToCompletion, resetDatabase, start } from '@/tests/setup/harness'

/**
 * Migration 021 materialises each finished category's champion — the value the
 * home dashboard counts titles with — and drops the `podiums` column that used
 * to be produced by the podium replay it replaces.
 *
 * `resetDatabase()` already applies it, so the pre-migration state is recreated
 * by emptying the column again, which is also what lets the backfill be
 * exercised on tournaments that were finished before it existed.
 */
describe('migration 021 — materialise the category champion', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('adds championCompetitorId to tournament_categories', async () => {
    await Schema.table('tournament_categories', (table) => {
      table.dropColumn('championCompetitorId')
    })

    expect(await Schema.hasColumn('tournament_categories', 'championCompetitorId')).toBe(false)

    await migration021.up()

    expect(await Schema.hasColumn('tournament_categories', 'championCompetitorId')).toBe(true)
  })

  it('drops the podiums column', async () => {
    expect(await Schema.hasColumn('player_statistics', 'podiums')).toBe(false)
  })

  it('is idempotent (a second run is a no-op)', async () => {
    await expect(migration021.up()).resolves.not.toThrow()
    await expect(migration021.up()).resolves.not.toThrow()
  })

  it('keeps the statistics cache upsertable after dropping podiums', async () => {
    // The drop is a table rebuild on SQLite, which loses the anonymous index
    // behind `playerId`'s inline UNIQUE — and without it the cache's
    // ON CONFLICT upsert fails. The migration puts it back; this is the guard.
    const indexes = await DB.query(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'player_statistics'"
    )

    expect(indexes.map((row) => String(row.name))).toContain('uq_player_statistics_player')
  })

  it('backfills the champion of tournaments that were already finished', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await playToCompletion(built)

    const categoryId = built.categoryIds[0]!
    const champion = (await TournamentCategory.where('id', categoryId).first())!.championCompetitorId

    expect(champion).not.toBeNull()

    // Back to the pre-migration state: the tournament is finished and nothing
    // records who won it, exactly like every tournament in a database that
    // predates this migration. The column is emptied rather than dropped —
    // SQLite implements a drop as a table rebuild, which would cascade the
    // matches away and leave nothing to derive a champion from.
    await DB.table('tournament_categories').update({ championCompetitorId: null })

    await migration021.up()

    expect((await TournamentCategory.where('id', categoryId).first())!.championCompetitorId).toBe(champion)
  })

  it('leaves running tournaments without a champion', async () => {
    const built = await buildTournament({
      type: TournamentType.PLAYOFF,
      competitors: 4,
      scoreFormat: ScoreFormat.BASIC_COUNT
    })

    await start(built)
    await migration021.up()

    expect(
      (await TournamentCategory.where('id', built.categoryIds[0]!).first())!.championCompetitorId ?? null
    ).toBeNull()
  })
})
