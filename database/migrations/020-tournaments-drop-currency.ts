import { DB, Schema } from '@neogroup/neorm'

/**
 * Drops `tournaments.currency`.
 *
 * The column was added alongside `entryFee` to record the ISO currency of a
 * tournament's entry fee, but it never became configurable: every write path
 * (tournament creation in services/tournaments.ts, the tournament form) has
 * always hardcoded it to `'ARS'`, and nothing in the product lets an
 * organizer pick another currency. `formatMoney` already defaults to `'ARS'`
 * when no currency is passed, so the display call sites (TournamentView,
 * TournamentCard, JoinTournamentDialog) drop the argument instead of reading
 * this column.
 *
 * This is unrelated to `tournament_payments.currency` (see migration
 * 015-payments-refactor), which backs the actual MercadoPago checkout and is
 * left untouched.
 *
 * Idempotent: guarded by a column probe, so re-running (or running against a
 * database created after this change) is a no-op.
 */
export default {
  name: '020-tournaments-drop-currency',

  async up(): Promise<void> {
    if (!(await Schema.hasColumn('tournaments', 'currency'))) {
      return
    }

    await DB.transaction(async () => {
      await Schema.table('tournaments', (table) => {
        table.dropColumn('currency')
      })
    })
  }
}
