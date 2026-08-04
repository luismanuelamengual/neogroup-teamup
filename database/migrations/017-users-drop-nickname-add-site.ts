import { DB, Schema } from '@neogroup/neorm'

/**
 * Two independent changes to `users`, bundled in one migration because both
 * touch the same table:
 *
 *   1. Drops `nickname` — the app no longer supports it; `getUserDisplayName`
 *      falls back straight to first/last name (or the email) instead.
 *   2. Adds the nullable `siteId` column: the user's home venue ("sede"),
 *      picked from the organization's `sites` catalogue (see migration
 *      008-sites) and editable from the account page. Left null means the
 *      user has no site set — same "not configured yet" default every other
 *      optional FK on this schema uses.
 *
 * Idempotent: each half is guarded by its own column probe, so re-running (or
 * running against a database created after this change) is a no-op.
 */
export default {
  name: '017-users-drop-nickname-add-site',

  async up(): Promise<void> {
    await DB.transaction(async () => {
      if (await Schema.hasColumn('users', 'nickname')) {
        await Schema.table('users', (table) => {
          table.dropColumn('nickname')
        })
      }

      if (!(await Schema.hasColumn('users', 'siteId'))) {
        await Schema.table('users', (table) => {
          table.integer('siteId').nullable()
        })

        await Schema.table('users', (table) => {
          table.index('siteId', 'idx_users_site')
        })

        // SQLite cannot attach a foreign key to a table that already exists, so
        // the constraint is PostgreSQL-only (production), same caveat as
        // tournaments.siteId in migration 008-sites.
        if ((process.env.DB_DRIVER ?? 'postgres') !== 'sqlite') {
          await Schema.table('users', (table) => {
            table.foreign('siteId').references('id').on('sites')
          })
        }
      }
    })
  }
}
