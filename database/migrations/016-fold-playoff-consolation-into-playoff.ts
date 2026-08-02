import { DB } from '@neogroup/neorm'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/**
 * Folds the former `PLAYOFF_WITH_CONSOLATION` tournament type into `PLAYOFF`
 * with its new `settings.consolationBracket` flag turned on (see
 * PlayoffSettings.ts). The dedicated type is gone from the `TournamentType`
 * enum — the consolation bracket is now an optional setting of a regular
 * `PLAYOFF` tournament, same structural feature, just configured instead of
 * hard-wired into a separate type.
 *
 * Every tournament that used to be created as "Eliminatoria con ronda
 * consuelo" (numeric type 5 — the value is hard-coded below since the enum
 * member no longer exists to import) keeps its main bracket, its consolation
 * bracket and every match already played exactly as they are: only
 * `tournaments.type` and `tournaments.settings` change, nothing structural
 * about matches/rounds needs touching, since the app's business logic
 * (`hasConsolationBracket` in utils/settings.ts) already reads the
 * consolation behaviour off `type === PLAYOFF && settings.consolationBracket`.
 *
 * Idempotent: the WHERE clause only ever matches rows still stuck at the old
 * type 5, so a second run (or a database that never had one) updates zero
 * rows.
 */

const OLD_PLAYOFF_WITH_CONSOLATION_TYPE = 5

/** Normalizes a raw `settings` value: parsed JSON object on PostgreSQL (jsonb → native object), JSON-encoded TEXT on SQLite. */
function toSettingsObject(value: unknown): Record<string, unknown> {
  if (value == null) {
    return {}
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>
  }

  try {
    const parsed: unknown = JSON.parse(String(value))

    return parsed != null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export default {
  name: '016-fold-playoff-consolation-into-playoff',

  async up(): Promise<void> {
    const rows = await DB.table('tournaments')
      .where('type', OLD_PLAYOFF_WITH_CONSOLATION_TYPE)
      .select('id', 'settings')
      .get()

    for (const row of rows) {
      const settings = toSettingsObject(row.settings)

      settings.consolationBracket = true

      await DB.table('tournaments')
        .where('id', Number(row.id))
        .update({ type: TournamentType.PLAYOFF, settings: JSON.stringify(settings) })
    }
  }
}
