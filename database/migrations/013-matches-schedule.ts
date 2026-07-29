import { Schema } from '@neogroup/neorm'

/**
 * Adds the scheduling fields to `matches`: where and when each match is (or was)
 * played, so a planning stops being a purely visual, browser-local artifact.
 *
 *   - `siteId`      venue of the match. Null means "the tournament's own site"
 *                   (`tournaments.siteId`), so a match only stores a venue when
 *                   it differs from the default one.
 *   - `date`        calendar day of the match, 'YYYY-MM-DD'.
 *   - `hour`        start time of the match, 'HH:mm'.
 *   - `courtNumber` 1-based court inside the venue.
 *
 * All four are nullable: a match that has not been scheduled yet simply has
 * them empty, which is the state every existing row starts in.
 *
 * `date` and `hour` are stored as strings rather than DATE/TIME on purpose.
 * A match date is a wall-clock value in the venue's timezone, not an instant:
 * modelled as a DATE it would come back as a `Date` at the *server's* midnight,
 * serialize to UTC through JSON and shift a day for clients in another
 * timezone. On top of that, `DATE` compiles to a real date type on PostgreSQL
 * but to a TEXT-affinity column on SQLite (the test harness), so the same row
 * would read back as a different JavaScript type per engine. Strings avoid both
 * problems and match how `tournaments.startDate` / `startTime` are already
 * stored. Ordering and range queries are unaffected: ISO 'YYYY-MM-DD' sorts
 * lexicographically exactly as it does chronologically.
 *
 * Idempotent: guarded by a column probe, so a second run (or a database created
 * after this change) is a no-op.
 */
export default {
  name: '013-matches-schedule',

  async up(): Promise<void> {
    if (await Schema.hasColumn('matches', 'date')) {
      return
    }

    await Schema.table('matches', (table) => {
      table.integer('siteId').nullable()
      table.string('date', 10).nullable()
      table.string('hour', 5).nullable()
      table.integer('courtNumber').nullable()
    })

    await Schema.table('matches', (table) => {
      table.index('siteId', 'idx_matches_site')
    })

    // SQLite cannot attach a foreign key to an already-existing table, so the
    // constraint is PostgreSQL-only (production) — same trade-off as migration
    // 008 for tournaments.siteId. On SQLite the service-level guard in
    // setMatchSchedule (which validates the site belongs to the organization)
    // is what produces the user-facing error anyway.
    if ((process.env.DB_DRIVER ?? 'postgres') !== 'sqlite') {
      await Schema.table('matches', (table) => {
        table.foreign('siteId').references('id').on('sites')
      })
    }
  }
}
