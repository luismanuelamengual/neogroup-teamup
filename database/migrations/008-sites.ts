import { DB, Schema } from '@neogroup/neorm'

/**
 * Turns the free-text `tournaments.location` into a real catalogue of venues
 * (`sites`) managed by the organization administrator, and points every
 * tournament at one of them through `tournaments.siteId`.
 *
 * Until now the organizer typed the venue by hand on every tournament, so the
 * same club ended up stored as "Club Belgrano", "club belgrano" and
 * "Club Belgrano " — impossible to filter or report on. Sites are now created
 * once by the administrator (ABM in /sites) and picked from a selector.
 *
 * Steps (all inside a single transaction):
 *
 *   1. Create the `sites` table (id, organizationId, name).
 *   2. Add the nullable `tournaments.siteId` column.
 *   3. Backfill: every distinct non-empty `location` of an organization becomes
 *      a site of that organization, and the tournaments that used that text are
 *      pointed at it. Matching is case-insensitive and ignores surrounding
 *      whitespace ("Club Belgrano " and "club belgrano" collapse into a single
 *      site); the first spelling found wins as the site name. Tournaments with
 *      no location keep `siteId` null.
 *   4. Drop `tournaments.location`.
 *   5. Add the foreign key + index on `siteId`, once the column holds only
 *      valid ids.
 *
 * Written entirely against neorm's engine-agnostic `Schema` API plus a portable
 * backfill through the query builder, so the exact same migration runs on
 * PostgreSQL (production) and on the in-memory SQLite database the test harness
 * builds. On SQLite, `dropColumn` transparently rebuilds the table.
 *
 * Idempotent: guarded by a column probe, so on a database created after this
 * change (or already migrated) it is a no-op.
 */

/** Reads a column value case-insensitively (PostgreSQL folds identifiers to lower case). */
function pick(row: Record<string, unknown>, name: string): unknown {
  return row[name] ?? row[name.toLowerCase()]
}

export default {
  name: '008-sites',

  async up(): Promise<void> {
    await DB.transaction(async () => {
      await Schema.createIfNotExists('sites', (table) => {
        table.increments('id')
        table.integer('organizationId')
        table.string('name', 150)

        table.index('organizationId', 'idx_sites_organization')
        table.foreign('organizationId').references('id').on('organizations')
      })

      // Already migrated (or a database created after this change): nothing to do.
      if (!(await Schema.hasColumn('tournaments', 'location'))) {
        return
      }

      await Schema.table('tournaments', (table) => {
        table.integer('siteId').nullable()
      })

      // Backfill. Key: `${organizationId}::${lowercased trimmed location}`.
      // `insert` does not read generated keys back on every engine, so each site
      // is selected again by (organizationId, name) right after being created.
      const tournaments = await DB.table('tournaments').select('id', 'organizationId', 'location').get()
      const siteIdsByKey = new Map<string, number>()

      for (const tournament of tournaments) {
        const organizationId = Number(pick(tournament, 'organizationId'))
        const location = String(pick(tournament, 'location') ?? '').trim()

        if (location === '') {
          continue
        }

        const key = `${organizationId}::${location.toLowerCase()}`
        let siteId = siteIdsByKey.get(key)

        if (siteId === undefined) {
          await DB.table('sites').insert({ organizationId, name: location })

          const site = await DB.table('sites')
            .select('id')
            .where('organizationId', organizationId)
            .where('name', location)
            .first()

          siteId = Number(pick(site as Record<string, unknown>, 'id'))
          siteIdsByKey.set(key, siteId)
        }

        await DB.table('tournaments').where('id', pick(tournament, 'id')).update({ siteId })
      }

      await Schema.table('tournaments', (table) => {
        table.dropColumn('location')
      })

      await Schema.table('tournaments', (table) => {
        table.index('siteId', 'idx_tournaments_site')
      })

      // SQLite cannot attach a foreign key to a table that already exists, so
      // the constraint is PostgreSQL-only (production). The test harness runs on
      // SQLite and relies on the service-level guard in services/sites.ts
      // instead, which is what produces the user-facing error anyway.
      if ((process.env.DB_DRIVER ?? 'postgres') !== 'sqlite') {
        await Schema.table('tournaments', (table) => {
          table.foreign('siteId').references('id').on('sites')
        })
      }
    })
  }
}
