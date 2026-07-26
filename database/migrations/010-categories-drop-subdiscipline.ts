import { DB, Schema } from '@neogroup/neorm'

/**
 * Drops `categories.subDiscipline`: a category is now scoped to a **discipline
 * only**.
 *
 * The sub-discipline was there because a tennis category used to belong either
 * to singles or to doubles. That stopped holding with the interclubes format,
 * where a single encounter is played partly in singles and partly in doubles,
 * so its categories ("Primera", "Segunda", …) are divisions rather than
 * modalities and have no sub-discipline to belong to. Rather than adding a
 * third "no modality" state — which every consumer would have to special-case —
 * the distinction is removed altogether: categories are divisions of a
 * discipline, and whether a given match is a single or a doubles is a property
 * of the tournament (and, in interclubes, of each individual match).
 *
 * **Merging duplicates.** Dropping the column can collide two categories that
 * only differed by modality ("4ta" in singles and "4ta" in doubles both become
 * "4ta" for tennis). The catalogue rejects duplicate names within a discipline
 * (case-insensitively), so leaving both would produce rows the ABM itself
 * considers invalid. They are merged instead: for every
 * (organization, discipline, lower-cased name) group the lowest id survives,
 * every `tournament_categories.categoryId` and `rankings.categoryId` pointing at
 * the others is repointed to it, and the now-unreferenced duplicates are
 * deleted. Merging (rather than renaming to "4ta (dobles)") is what matches the
 * intent: the ranking of a category was split across near-duplicates, and this
 * ABM exists precisely to put it back together.
 *
 * Written against neorm's engine-agnostic `Schema` / query builder, so it runs
 * the same on PostgreSQL and on the in-memory SQLite the test harness builds.
 *
 * **Why the column drop sits outside the transaction.** PostgreSQL performs a
 * real `ALTER TABLE … DROP COLUMN`, but SQLite has no such statement: dropping a
 * column there rebuilds the whole table (create → copy → drop → rename). Since
 * `tournament_categories` and `rankings` hold foreign keys to `categories`, that
 * intermediate DROP trips the constraint. SQLite's own documented procedure for
 * a table rebuild is to turn `foreign_keys` off around it — and that pragma is a
 * no-op inside a transaction, which is why the merge and the drop are two
 * separate steps. The merge is the part that must be atomic (it moves history
 * between rows); the drop is a single statement that either happens or doesn't,
 * and re-running the migration after a failed drop simply finds no duplicates
 * left to merge and retries it.
 *
 * Idempotent: guarded by a column probe, so a second run is a no-op.
 */

/** Reads a column value case-insensitively (PostgreSQL folds identifiers to lower case). */
function pick(row: Record<string, unknown>, name: string): unknown {
  return row[name] ?? row[name.toLowerCase()]
}

export default {
  name: '010-categories-drop-subdiscipline',

  async up(): Promise<void> {
    // Already migrated (or a database created after this change): nothing to do.
    if (!(await Schema.hasColumn('categories', 'subDiscipline'))) {
      return
    }

    await DB.transaction(async () => {
      const categories = await DB.table('categories').select('id', 'organizationId', 'discipline', 'name').get()
      // Key: `${organizationId}::${discipline}::${lower-cased name}` → surviving id.
      const survivorByKey = new Map<string, number>()
      const merges: { from: number; into: number }[] = []

      // Ascending id, so the oldest row of each group is the one that survives.
      for (const category of [...categories].sort((a, b) => Number(pick(a, 'id')) - Number(pick(b, 'id')))) {
        const id = Number(pick(category, 'id'))
        const organizationId = Number(pick(category, 'organizationId'))
        const discipline = Number(pick(category, 'discipline'))
        const name = String(pick(category, 'name') ?? '')
          .trim()
          .toLowerCase()
        const key = `${organizationId}::${discipline}::${name}`
        const survivor = survivorByKey.get(key)

        if (survivor === undefined) {
          survivorByKey.set(key, id)

          continue
        }

        merges.push({ from: id, into: survivor })
      }

      for (const { from, into } of merges) {
        await DB.table('tournament_categories').where('categoryId', from).update({ categoryId: into })
        await DB.table('rankings').where('categoryId', from).update({ categoryId: into })
        await DB.table('categories').where('id', from).delete()
      }
    })

    // See the note above: on SQLite this rebuilds the table, so foreign key
    // enforcement is lifted around it (the pragma is ignored inside a
    // transaction, hence the separate step). On PostgreSQL it is a plain ALTER.
    const isSqlite = (process.env.DB_DRIVER ?? 'postgres') === 'sqlite'

    if (isSqlite) {
      await DB.execute('PRAGMA foreign_keys = OFF')
    }

    try {
      await Schema.table('categories', (table) => {
        table.dropColumn('subDiscipline')
      })
    } finally {
      if (isSqlite) {
        await DB.execute('PRAGMA foreign_keys = ON')
      }
    }
  }
}
