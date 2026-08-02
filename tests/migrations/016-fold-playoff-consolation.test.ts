import { DB } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import migration016 from '@/database/migrations/016-fold-playoff-consolation-into-playoff'
import { buildTournament, resetDatabase } from '@/tests/setup/harness'

/**
 * Migration 016 folds the old PLAYOFF_WITH_CONSOLATION tournament type
 * (numeric value 5, removed from the TournamentType enum) into PLAYOFF (3)
 * with `settings.consolationBracket = true`.
 *
 * `resetDatabase()` already applies it, so every assertion below rebuilds the
 * pre-migration state (a row still at type 5) before re-running it.
 */

const OLD_PLAYOFF_WITH_CONSOLATION_TYPE = 5

describe('migration 016 — fold PLAYOFF_WITH_CONSOLATION into PLAYOFF', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('converts a type-5 row to PLAYOFF with consolationBracket enabled', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 8, settings: { foo: 'bar' } })

    // Simulate the pre-migration production state.
    await DB.table('tournaments').where('id', built.tournament.id).update({ type: OLD_PLAYOFF_WITH_CONSOLATION_TYPE })

    await migration016.up()

    const row = await DB.table('tournaments').select('type', 'settings').where('id', built.tournament.id).first()

    expect(Number(row!.type)).toBe(TournamentType.PLAYOFF)

    const settings =
      typeof row!.settings === 'string'
        ? JSON.parse(row!.settings as string)
        : (row!.settings as Record<string, unknown>)

    expect(settings.consolationBracket).toBe(true)
    // Pre-existing settings keys are preserved, not clobbered.
    expect(settings.foo).toBe('bar')
  })

  it('leaves every other tournament type untouched', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4 })

    await migration016.up()

    const row = await DB.table('tournaments').select('type').where('id', built.tournament.id).first()

    expect(Number(row!.type)).toBe(TournamentType.LEAGUE)
  })

  it('is idempotent (a second run is a no-op)', async () => {
    const built = await buildTournament({ type: TournamentType.PLAYOFF, competitors: 8 })

    await DB.table('tournaments').where('id', built.tournament.id).update({ type: OLD_PLAYOFF_WITH_CONSOLATION_TYPE })

    await migration016.up()
    await expect(migration016.up()).resolves.not.toThrow()

    const row = await DB.table('tournaments').select('type', 'settings').where('id', built.tournament.id).first()

    expect(Number(row!.type)).toBe(TournamentType.PLAYOFF)

    const settings =
      typeof row!.settings === 'string'
        ? JSON.parse(row!.settings as string)
        : (row!.settings as Record<string, unknown>)

    expect(settings.consolationBracket).toBe(true)
  })
})
