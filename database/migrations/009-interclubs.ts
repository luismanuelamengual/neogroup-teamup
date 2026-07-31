import { Schema } from '@neogroup/neorm'

/**
 * Adds the two columns the "Interclubes" tournament type needs on the
 * registration side.
 *
 * An interclubes competitor is not a player nor a pair: it is a **team of a
 * venue** (a "sede", `sites`) made up of N players (4 or more). Two things
 * follow from that, and neither fits the columns competitors had so far:
 *
 *   1. **`competitors.data` (JSONB)** — the venue the team represents, stored
 *      as `{ "siteId": 5 }`. It is deliberately a free-shaped JSONB "extra
 *      attributes" bag rather than a dedicated `siteId` column: it is only
 *      meaningful for one tournament type, and the same column can absorb
 *      whatever other per-type attributes future types need without another
 *      migration (the same reasoning behind `tournaments.settings` and the
 *      JSONB `matches.score`, see 006).
 *
 *   2. **`competitors.label` (TEXT)** — the display name of the team. When set
 *      it replaces the concatenated player names everywhere the competitor is
 *      rendered (`Competitor.displayName` / `shortName`). It holds the venue
 *      name, disambiguated with a letter when a venue enters more than one team
 *      in the same tournament category ("Alemán A", "Alemán B"). It is stored
 *      rather than derived because it depends on the other teams registered at
 *      that moment, and it must stay stable for a match/score already played.
 *
 * **`tournament_payments.data` (JSONB)** mirrored `competitors.data` for the
 * paid-registration flow of the time: the competitor of a paid tournament was
 * only created when Mercado Pago confirmed the payment, so the webhook re-ran
 * the registration from the snapshot stored in the payment row, and the chosen
 * venue had nowhere else to live. That flow — and the whole table — is gone as
 * of migration 015; the column is still added here for databases that have not
 * reached it yet.
 *
 * All three columns are nullable and only ever populated for interclubes, so
 * every existing row (and every other tournament type) is unaffected: no
 * backfill is needed.
 *
 * Written against neorm's engine-agnostic `Schema` API — `jsonb()` compiles to
 * a native JSONB column on PostgreSQL and to TEXT on SQLite, so the exact same
 * migration runs in production and in the in-memory database the test harness
 * builds. Idempotent: every column is guarded by a `hasColumn` probe.
 */
export default {
  name: '009-interclubs',

  async up(): Promise<void> {
    // Each ALTER runs on its own (no wrapping transaction): SQLite rebuilds the
    // table for some column operations, and grouping them buys nothing here
    // since every step is independently idempotent.
    if (!(await Schema.hasColumn('competitors', 'data'))) {
      await Schema.table('competitors', (table) => {
        table.jsonb('data').nullable()
      })
    }

    if (!(await Schema.hasColumn('competitors', 'label'))) {
      await Schema.table('competitors', (table) => {
        table.text('label').nullable()
      })
    }

    // `tournament_payments` is dropped by migration 015 (registrations are no
    // longer charged through the platform), so the table only exists on
    // databases that have not reached it yet — hence the table probe on top of
    // the column one, which keeps this migration re-runnable afterwards.
    if ((await Schema.hasTable('tournament_payments')) && !(await Schema.hasColumn('tournament_payments', 'data'))) {
      await Schema.table('tournament_payments', (table) => {
        table.jsonb('data').nullable()
      })
    }
  }
}
