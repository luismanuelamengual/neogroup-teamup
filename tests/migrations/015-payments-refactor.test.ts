import { DB, Schema } from '@neogroup/neorm'
import { beforeEach, describe, expect, it } from 'vitest'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import migration015 from '@/database/migrations/015-payments-refactor'
import { buildTournament, resetDatabase } from '@/tests/setup/harness'

/**
 * Migration 015 is the schema half of the payments refactor. What matters is
 * that it lands the new settlement shape, that it resets the resemantized
 * `tournaments.paid` (it used to mean "charges an entry fee" and now means "the
 * service fee was settled", so leaving the old values would read as a pile of
 * already-paid tournaments), and that it removes the tables of the old
 * per-registration flow.
 *
 * `resetDatabase()` already applies it, so the assertions run on the migrated
 * schema and the pre-migration shape is recreated where a test needs it.
 */
describe('migration 015 — payments refactor', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('adds the settlement columns to tournaments', async () => {
    expect(await Schema.hasColumn('tournaments', 'paid')).toBe(true)
    expect(await Schema.hasColumn('tournaments', 'paidAt')).toBe(true)
    expect(await Schema.hasColumn('tournaments', 'servicePaymentId')).toBe(true)
  })

  it('creates service_payments with its snapshot columns', async () => {
    expect(await Schema.hasTable('service_payments')).toBe(true)

    for (const column of [
      'organizationId',
      'userId',
      'tournamentIds',
      'competitorsCount',
      'grossAmount',
      'serviceFeePercentage',
      'amount',
      'currency',
      'status',
      'preferenceId',
      'mpPaymentId',
      'initPoint'
    ]) {
      expect(await Schema.hasColumn('service_payments', column)).toBe(true)
    }
  })

  it('drops the tables of the old per-registration flow', async () => {
    expect(await Schema.hasTable('tournament_payments')).toBe(false)
    expect(await Schema.hasTable('mercadopago_accounts')).toBe(false)
  })

  it('resets paid on every pre-existing row, whatever it used to mean', async () => {
    // Rebuild the pre-migration state: `paid` still carrying its old meaning
    // ("this tournament charges an entry fee") and no settlement columns.
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 2, entryFee: 1000 })

    await DB.table('tournaments').where('id', built.tournament.id).update({ paid: true })
    await Schema.table('tournaments', (table) => {
      table.dropColumn(['paidAt', 'servicePaymentId'])
    })

    await migration015.up()

    const row = await DB.table('tournaments')
      .select('paid', 'paidAt', 'servicePaymentId', 'entryFee')
      .where('id', built.tournament.id)
      .first()

    // Not settled — but still a tournament with a cost, which is now read off
    // the entry fee rather than off `paid`.
    expect(Boolean(row!.paid)).toBe(false)
    expect(row!.paidAt ?? null).toBeNull()
    expect(row!.servicePaymentId ?? null).toBeNull()
    expect(Number(row!.entryFee)).toBe(1000)
  })

  it('is idempotent (a second run is a no-op)', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 2, entryFee: 1000, paid: true })

    await expect(migration015.up()).resolves.not.toThrow()

    // The guard is the `paidAt` column probe, so a re-run must not wipe the
    // settlement flags of tournaments that were already paid.
    const row = await DB.table('tournaments').select('paid').where('id', built.tournament.id).first()

    expect(Boolean(row!.paid)).toBe(true)
  })
})
