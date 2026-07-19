import { DB, Schema } from '@neogroup/neorm'

/**
 * Migrates `competitors` and `tournament_payments` from the pair-based columns
 * (`userId` / `partnerUserId`) to a single `playerIds` INTEGER[] roster, so a
 * competitor can hold more than two players (team disciplines).
 *
 * Written entirely against neorm's engine-agnostic `Schema` API (plus a portable
 * data backfill through the query builder), so the exact same migration runs on
 * PostgreSQL (production) and on the in-memory SQLite database the test harness
 * builds. On SQLite, `dropColumn` transparently rebuilds the table (userId /
 * partnerUserId are indexed / foreign-key columns that SQLite cannot ALTER-drop).
 *
 * It is guarded by a column probe so it is idempotent: once the columns have been
 * migrated (or on a database created after this change) it is a no-op.
 */
async function migrateTable(table: string): Promise<void> {
  if (!(await Schema.hasColumn(table, 'userId'))) {
    return
  }

  // 1. Add the roster column (INTEGER[] on PostgreSQL, JSON TEXT on SQLite).
  await Schema.table(table, (blueprint) => {
    blueprint.integerArray('playerIds').default([])
  })

  // 2. Backfill [userId, partnerUserId] (NULLs removed, order preserved) through
  //    the query builder so it works on every engine. Raw rows are not mapped
  //    through the entity layer, so read the keys case-insensitively: PostgreSQL
  //    folds unquoted identifiers to lower case (userId → userid) while SQLite
  //    preserves the declared casing.
  const rows = await DB.table(table).select('id', 'userId', 'partnerUserId').get()

  for (const row of rows) {
    const userId = row.userId ?? row.userid
    const partnerUserId = row.partnerUserId ?? row.partneruserid
    const playerIds = [userId, partnerUserId].filter((id) => id != null).map((id) => Number(id))

    await DB.table(table).where('id', row.id).update({ playerIds })
  }

  // 3. Drop the old columns. This also removes their foreign keys and the userId
  //    index (PostgreSQL cascades on the column; SQLite rebuilds the table).
  await Schema.table(table, (blueprint) => {
    blueprint.dropColumn('userId')
    blueprint.dropColumn('partnerUserId')
  })

  // 4. GIN index so `playerIds @> ARRAY[:id]` membership stays index-backed
  //    (PostgreSQL). SQLite ignores the method and creates a plain index.
  await Schema.table(table, (blueprint) => {
    blueprint.index('playerIds', `idx_${table}_players`).using('gin')
  })
}

export default {
  name: '002-competitors-player-ids',

  async up(): Promise<void> {
    await DB.transaction(async () => {
      await migrateTable('competitors')
      await migrateTable('tournament_payments')
    })
  }
}
