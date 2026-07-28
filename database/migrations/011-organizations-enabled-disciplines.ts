import { Schema } from '@neogroup/neorm'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'

/**
 * Adds `organizations.enabledDisciplines`: the subset of the Discipline catalogue
 * (see app/(protected)/(tournaments)/models/Discipline.ts) that an organization
 * actually offers. Every discipline-listing screen (categories, rankings,
 * tournament form) filters its options against this instead of showing the
 * full catalogue, so an organization that only runs one discipline never sees
 * the other one.
 *
 * Defaults to both disciplines that exist today (padel and tennis) so every
 * existing organization keeps working exactly as before — the column only
 * narrows behaviour when an administrator (via a future ABM, or directly)
 * removes one.
 *
 * Written against neorm's engine-agnostic `Schema` API: `integerArray()` maps to
 * a native INTEGER[] on PostgreSQL and a JSON-encoded TEXT column on SQLite,
 * same as `organizations.allowedRegistrationRoles` (migration 001).
 *
 * Idempotent: guarded by a column probe, so a second run (or a database
 * created after this change) is a no-op.
 */
export default {
  name: '011-organizations-enabled-disciplines',

  async up(): Promise<void> {
    if (await Schema.hasColumn('organizations', 'enabledDisciplines')) {
      return
    }

    await Schema.table('organizations', (table) => {
      table.integerArray('enabledDisciplines').default([Discipline.PADEL, Discipline.TENNIS])
    })
  }
}
