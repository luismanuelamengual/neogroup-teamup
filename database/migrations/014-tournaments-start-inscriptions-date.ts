import { Schema } from '@neogroup/neorm'

/**
 * Adds `tournaments.startInscriptionsDate`: an optional "YYYY-MM-DD" date
 * (same format as `startDate`) from which the tournament starts accepting
 * registrations.
 *
 * Null (the default) means registrations are open since the tournament was
 * created — the previous, only behaviour. When set, `resolveRegistration`
 * (app/(protected)/(tournaments)/services/registrations.ts) rejects join
 * attempts before that date, and the player-facing tournament view hides the
 * "Inscribirme" button until then.
 *
 * Idempotent: guarded by a column probe, so a second run (or a database
 * created after this change) is a no-op.
 */
export default {
  name: '014-tournaments-start-inscriptions-date',

  async up(): Promise<void> {
    if (await Schema.hasColumn('tournaments', 'startInscriptionsDate')) {
      return
    }

    await Schema.table('tournaments', (table) => {
      table.string('startInscriptionsDate', 10).nullable()
    })
  }
}
