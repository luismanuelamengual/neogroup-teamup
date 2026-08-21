import { Schema } from '@neogroup/neorm'

/**
 * Adds the `sites.data` JSON document, where a venue's settings live: how many
 * courts it has, how they are named, and the duration it was last planned with
 * (see SiteData).
 *
 * Until now that setup was written to the organizer's own browser
 * (`localStorage`, keyed `tournamentPlanner:courts:{siteId}`), which was enough
 * while the planner was the only screen that drew a court column. It stops
 * being enough as soon as a player can open the published schedule: "Cancha 3"
 * has to name the same court on both screens, and a player's browser has never
 * seen the organizer's storage. So the setup moves to the venue itself.
 *
 * Nothing is backfilled — the previous values are unreachable from the server,
 * they only exist in whichever browser typed them. A venue with no document
 * simply falls back to the same defaults it had before (2 courts, "Cancha N"),
 * and the next time an organizer opens the planner on it the setup is stored
 * for good.
 *
 * `jsonb()` compiles to a native JSONB column on PostgreSQL (production) and to
 * TEXT on SQLite (the in-memory database the test harness builds), the same way
 * `tournaments.settings` and `matches.score` already do.
 *
 * Idempotent: guarded by a column probe, so a second run — or a database
 * created after this change — is a no-op.
 */
export default {
  name: '019-sites-data',

  async up(): Promise<void> {
    if (await Schema.hasColumn('sites', 'data')) {
      return
    }

    await Schema.table('sites', (table) => {
      table.jsonb('data').nullable()
    })
  }
}
