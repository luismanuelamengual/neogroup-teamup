import { Schema } from '@neogroup/neorm'

/**
 * Adds `tournaments.allowPlayerSetScore`: when true, a player taking part in a
 * match is allowed to submit its result themselves (same as the tournament
 * owner). When false (the default), only the tournament owner/organizer can
 * set a match score — see setMatchResult in
 * app/(protected)/(tournaments)/services/tournaments.ts.
 *
 * Defaults to false so every existing tournament keeps the stricter,
 * organizer-only behaviour it already had.
 *
 * Idempotent: guarded by a column probe, so a second run (or a database
 * created after this change) is a no-op.
 */
export default {
  name: '012-tournaments-allow-player-set-score',

  async up(): Promise<void> {
    if (await Schema.hasColumn('tournaments', 'allowPlayerSetScore')) {
      return
    }

    await Schema.table('tournaments', (table) => {
      table.boolean('allowPlayerSetScore').default(false)
    })
  }
}
