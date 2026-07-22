import { DB, Schema } from '@neogroup/neorm'

/**
 * Removes the `rounds` table and folds everything it held onto `matches`, so the
 * matches become the single source of truth for a tournament's structure.
 *
 * New `matches` columns:
 *   - roundNumber   → 1-based round ("fecha") within the match's lane (was rounds.number).
 *   - type          → lane discriminator, MatchType (BRACKET=0, LEAGUE=1, CONSOLATION_BRACKET=2),
 *                     mapped from the old rounds.type RoundType (KNOCKOUT=1, KNOCKOUT_CONSOLATION=2,
 *                     LEAGUE=3, AMERICANO=4).
 *   - groupNumber   → group index of a groups+playoff group lane (was rounds.groupNumber).
 *   - bracketInstance → knockout only: the bracket instance counted from the final (1 = Final,
 *                       2 = Semifinal, 3 = Cuartos, …); null for round-robin lanes. The winner
 *                       advances to the same-lane match at bracketInstance − 1 and
 *                       position floor(p/2), so the next match is derivable without a pointer.
 *
 * The existing `matches.position` (order of the match inside its round) is kept
 * as-is; only `roundId` is dropped, since the round it pointed at is gone.
 *
 * The former rounds.status (open/closed) and rounds.active (frontier / grace
 * window) are no longer stored — they are computed from the matches at read time.
 *
 * Written against neorm's engine-agnostic Schema API plus a portable backfill
 * through the query builder, so the exact same migration runs on PostgreSQL
 * (production) and on the in-memory SQLite database the test harness builds. On
 * SQLite, `dropColumn` transparently rebuilds the table (roundId is an indexed /
 * foreign-key column that SQLite cannot ALTER-drop).
 *
 * Idempotent: guarded by a column probe, so once matches carries `roundNumber`
 * (or on a database created after this change) it is a no-op.
 */

/** Reads a column value case-insensitively (PostgreSQL folds identifiers to lower case). */
function pick(row: Record<string, unknown>, name: string): unknown {
  return row[name] ?? row[name.toLowerCase()]
}

/** RoundType (rounds.type) → MatchType (matches.type). */
function mapType(roundType: number): number {
  // KNOCKOUT(1) → BRACKET(0); KNOCKOUT_CONSOLATION(2) → CONSOLATION_BRACKET(2);
  // LEAGUE(3) and AMERICANO(4) → LEAGUE(1).
  if (roundType === 1) {
    return 0
  }

  if (roundType === 2) {
    return 2
  }

  return 1
}

export default {
  name: '004-drop-rounds-denormalize-matches',

  async up(): Promise<void> {
    // Nothing to do on databases that never had the rounds table, or that have
    // already been migrated.
    if (!(await Schema.hasTable('rounds')) || (await Schema.hasColumn('matches', 'roundNumber'))) {
      return
    }

    await DB.transaction(async () => {
      // 1. Add the new columns. Defaults keep the ADD COLUMN safe on tables that
      //    already hold rows; the real values are set by the backfill below.
      //    `position` already exists on matches and is kept unchanged.
      await Schema.table('matches', (table) => {
        table.integer('roundNumber').default(1)
        table.integer('type').default(1)
        table.integer('groupNumber').nullable()
        table.integer('bracketInstance').nullable()
      })

      // 2. Backfill roundNumber / type / groupNumber from the round each match
      //    belonged to.
      const rounds = await DB.table('rounds').select('id', 'number', 'type', 'groupNumber').get()
      const roundById = new Map<number, { number: number; type: number; groupNumber: number | null }>()

      for (const row of rounds) {
        const groupNumber = pick(row, 'groupNumber')

        roundById.set(Number(pick(row, 'id')), {
          number: Number(pick(row, 'number')),
          type: Number(pick(row, 'type')),
          groupNumber: groupNumber == null ? null : Number(groupNumber)
        })
      }

      const matches = await DB.table('matches').select('id', 'roundId').get()

      for (const row of matches) {
        const round = roundById.get(Number(pick(row, 'roundId')))

        if (!round) {
          continue
        }

        await DB.table('matches')
          .where('id', Number(pick(row, 'id')))
          .update({
            roundNumber: round.number,
            type: mapType(round.type),
            groupNumber: round.groupNumber
          })
      }

      // 3. Backfill bracketInstance for the knockout lanes: within a category +
      //    lane (type + groupNumber), the instance counts from the final, so it is
      //    (maxRoundNumber − roundNumber + 1) — the final (highest round) is 1.
      const laneRows = await DB.table('matches')
        .select('id', 'tournamentCategoryId', 'roundNumber', 'type', 'groupNumber')
        .get()
      const knockoutByLane = new Map<string, Record<string, unknown>[]>()

      for (const row of laneRows) {
        const type = Number(pick(row, 'type'))

        // Only knockout lanes (BRACKET = 0, CONSOLATION_BRACKET = 2) have a bracket instance.
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

      // 4. Index for the new lookup pattern (lane scans).
      await Schema.table('matches', (table) => {
        table.index(['tournamentCategoryId', 'type', 'groupNumber'], 'idx_matches_lane')
      })

      // 5. Drop the now-orphaned roundId column. This also removes its foreign key
      //    and the idx_matches_round index (PostgreSQL cascades on the column;
      //    SQLite rebuilds the table). `position` is kept.
      await Schema.table('matches', (table) => {
        table.dropColumn('roundId')
      })

      // 6. Drop the now-unused rounds table.
      await Schema.dropIfExists('rounds')
    })
  }
}
