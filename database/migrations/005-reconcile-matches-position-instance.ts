import { DB, Schema } from '@neogroup/neorm'

/**
 * Reconciles `matches` for databases that ran an EARLIER build of migration 004,
 * before its columns were renamed. Two interim shapes existed and are healed here:
 *
 *   - `bracketNumber` (later renamed to the pre-existing `position`).
 *   - `nextMatchId`   (later replaced by the derivable `bracketInstance`).
 *
 * A staging database that applied one of those interim 004 builds ends up with
 * `bracketNumber` instead of `position` (and possibly `nextMatchId` instead of
 * `bracketInstance`). Since a migration that is already recorded as applied is
 * never re-run, this forward-only migration converges every environment onto the
 * final schema.
 *
 * On a fresh database, or on any database that ran the FINAL migration 004, the
 * matches table is already in its final shape and every step below is skipped —
 * this migration is a no-op there.
 *
 * Engine-agnostic (PostgreSQL + SQLite): `renameColumn` compiles to
 * `ALTER TABLE … RENAME COLUMN`, and `dropColumn` drops the column together with
 * its index (PostgreSQL cascades; SQLite rebuilds the table).
 */

/** Reads a column value case-insensitively (PostgreSQL folds identifiers to lower case). */
function pick(row: Record<string, unknown>, name: string): unknown {
  return row[name] ?? row[name.toLowerCase()]
}

export default {
  name: '005-reconcile-matches-position-instance',

  async up(): Promise<void> {
    const hasBracketNumber = await Schema.hasColumn('matches', 'bracketNumber')
    const hasPosition = await Schema.hasColumn('matches', 'position')
    const hasBracketInstance = await Schema.hasColumn('matches', 'bracketInstance')
    const hasNextMatchId = await Schema.hasColumn('matches', 'nextMatchId')

    // Already in the final shape → nothing to do.
    if (!hasBracketNumber && hasPosition && hasBracketInstance && !hasNextMatchId) {
      return
    }

    await DB.transaction(async () => {
      // a) bracketNumber → position (the interim name of the intra-round order).
      if (hasBracketNumber && !hasPosition) {
        await Schema.table('matches', (table) => {
          table.renameColumn('bracketNumber', 'position')
        })
      }

      // b) nextMatchId → bracketInstance: add the derivable instance and backfill
      //    it for the knockout lanes (instance = maxRoundNumber(lane) − roundNumber
      //    + 1, so the final is 1), then drop the old pointer column.
      if (!hasBracketInstance) {
        await Schema.table('matches', (table) => {
          table.integer('bracketInstance').nullable()
        })

        const rows = await DB.table('matches')
          .select('id', 'tournamentCategoryId', 'roundNumber', 'type', 'groupNumber')
          .get()
        const knockoutByLane = new Map<string, Record<string, unknown>[]>()

        for (const row of rows) {
          const type = Number(pick(row, 'type'))

          // Only knockout lanes (BRACKET = 0, CONSOLATION_BRACKET = 2) have an instance.
          if (type !== 0 && type !== 2) {
            continue
          }

          const groupNumber = pick(row, 'groupNumber')
          const laneKey = `${Number(pick(row, 'tournamentCategoryId'))}:${type}:${groupNumber ?? 'null'}`

          if (!knockoutByLane.has(laneKey)) {
            knockoutByLane.set(laneKey, [])
          }

          knockoutByLane.get(laneKey)!.push(row)
        }

        for (const list of knockoutByLane.values()) {
          const maxRound = Math.max(...list.map((row) => Number(pick(row, 'roundNumber'))))

          for (const row of list) {
            const roundNumber = Number(pick(row, 'roundNumber'))

            await DB.table('matches')
              .where('id', Number(pick(row, 'id')))
              .update({ bracketInstance: maxRound - roundNumber + 1 })
          }
        }
      }

      if (hasNextMatchId) {
        await Schema.table('matches', (table) => {
          table.dropColumn('nextMatchId')
        })
      }
    })
  }
}
