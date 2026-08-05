import { DB, Schema } from '@neogroup/neorm'

/**
 * Replaces `matches.homeCompetitorIds` / `awayCompetitorIds` (integer arrays)
 * with single, nullable FK columns `homeCompetitorId` / `awayCompetitorId`
 * (→ competitors.id).
 *
 * The arrays existed for exactly one reason: the now-removed
 * `AMERICANO_WITH_SWAP` tournament type ("Americana con intercambio de
 * pareja", old numeric type 6 — see TournamentType.ts) registered individuals
 * rather than pairs and teamed two of them up per side per round, so a side
 * could hold up to 2 competitor ids. Every other type's "competitor" is
 * already the full side (a single player, a pre-formed pair via
 * `competitors.partnerUserId`, or an interclubes team), so its array only
 * ever held 0 or 1 id. With the type gone, a side is always a single
 * competitor (or none yet), so a scalar column is all that is ever needed:
 *
 *   - a real value → that competitor plays this side.
 *   - null → either the slot is not yet known (a "to be defined" knockout
 *     placeholder awaiting its feeder match, `status` PENDING) or the side
 *     structurally never gets one (a bye/void slot, `status` WALKOVER/VOID).
 *     `status` is what tells the two apart — see Match.ts.
 *
 * Steps:
 *   1. Delete every AMERICANO_WITH_SWAP tournament (and everything hanging off
 *      it — categories, competitors, matches). There is no way to represent
 *      its up-to-2-competitor sides in the new column, and there is nothing to
 *      preserve: the type was already removed from the product, so remaining
 *      rows only exist in databases that were never migrated. Production never
 *      had any; staging did (from `yarn db:seed`) and is fully disposable —
 *      re-running the seed script rebuilds it.
 *   2. Add the two new nullable columns.
 *   3. Backfill them from the first (only) element of the old arrays.
 *   4. Drop the old array columns.
 *
 * Written against neorm's engine-agnostic `Schema` API plus a portable
 * backfill through the query builder, so the exact same migration runs on
 * PostgreSQL (production) and the in-memory SQLite database the test harness
 * builds. On SQLite, `dropColumn` transparently rebuilds the table.
 *
 * Idempotent: guarded by a column probe, so a second run (or a database
 * created after this change) is a no-op.
 */

const OLD_AMERICANO_WITH_SWAP_TYPE = 6

/** Reads a column value case-insensitively (PostgreSQL folds identifiers to lower case). */
function pick(row: Record<string, unknown>, name: string): unknown {
  return row[name] ?? row[name.toLowerCase()]
}

/**
 * First id of a raw `integerArray` column value: a native array on
 * PostgreSQL, a JSON-encoded TEXT column on SQLite (see migration 001). Null
 * when the array is null/empty/unparsable.
 */
function firstId(value: unknown): number | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? Number(value[0]) : null
  }

  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)

      return Array.isArray(parsed) && parsed.length > 0 ? Number(parsed[0]) : null
    } catch {
      return null
    }
  }

  return null
}

export default {
  name: '018-single-competitor-per-side',

  async up(): Promise<void> {
    if (await Schema.hasColumn('matches', 'homeCompetitorId')) {
      return
    }

    await DB.transaction(async () => {
      // 1. Drop every AMERICANO_WITH_SWAP tournament, cascading explicitly
      // (rather than relying on FK ON DELETE CASCADE, which SQLite may not
      // enforce) — same pattern as scripts/seed-database.ts's
      // clearDemoOrganizationData.
      const tournamentIds = (
        await DB.table('tournaments').select('id').where('type', OLD_AMERICANO_WITH_SWAP_TYPE).get()
      ).map((row) => Number(pick(row, 'id')))

      if (tournamentIds.length > 0) {
        const categoryIds = (
          await DB.table('tournament_categories').select('id').whereIn('tournamentId', tournamentIds).get()
        ).map((row) => Number(pick(row, 'id')))

        if (categoryIds.length > 0) {
          await DB.table('matches').whereIn('tournamentCategoryId', categoryIds).delete()
          await DB.table('competitors').whereIn('tournamentCategoryId', categoryIds).delete()
          await DB.table('tournament_categories').whereIn('id', categoryIds).delete()
        }

        await DB.table('tournaments').whereIn('id', tournamentIds).delete()
      }

      // 2. Add the new nullable scalar columns.
      await Schema.table('matches', (table) => {
        table.integer('homeCompetitorId').nullable()
        table.integer('awayCompetitorId').nullable()
      })

      // 3. Backfill from the (now guaranteed 0-or-1-element) old arrays.
      const rows = await DB.table('matches').select('id', 'homeCompetitorIds', 'awayCompetitorIds').get()

      for (const row of rows) {
        await DB.table('matches')
          .where('id', Number(pick(row, 'id')))
          .update({
            homeCompetitorId: firstId(pick(row, 'homeCompetitorIds')),
            awayCompetitorId: firstId(pick(row, 'awayCompetitorIds'))
          })
      }

      // 4. Index the new lookup columns, and FK them to competitors. SQLite
      // cannot attach a foreign key to an already-existing table (same
      // trade-off as migration 008/013), so the constraint is PostgreSQL-only;
      // service-level validation already guarantees referential integrity.
      await Schema.table('matches', (table) => {
        table.index('homeCompetitorId', 'idx_matches_home_competitor')
        table.index('awayCompetitorId', 'idx_matches_away_competitor')
      })

      if ((process.env.DB_DRIVER ?? 'postgres') !== 'sqlite') {
        await Schema.table('matches', (table) => {
          table.foreign('homeCompetitorId').references('id').on('competitors')
          table.foreign('awayCompetitorId').references('id').on('competitors')
        })
      }

      // 5. Drop the old array columns.
      await Schema.table('matches', (table) => {
        table.dropColumn('homeCompetitorIds')
        table.dropColumn('awayCompetitorIds')
      })
    })
  }
}
