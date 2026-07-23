import { DB, Schema } from '@neogroup/neorm'

/**
 * Converts `matches.score` from TEXT to JSONB.
 *
 * Historically this column held a compact, self-describing string:
 *
 *   `{scoreFormatId}:{results}`   (results concatenated with "|")
 *
 *   - 3 sets:                "1:6-2|6-4", "1:5-7|6-4|1-6", walkover "1:wo1"
 *   - 2 sets + super t-break: "2:6-2|7-6", "2:6-1|6-7|13-11", walkover "2:wo2"
 *   - basic count:           "3:14-5", "3:9-18", walkover "3:wo1"
 *
 * That string is now replaced by the equivalent JSON shape (the app's
 * MatchScore type), WITHOUT the format prefix — the shape itself already
 * disambiguates (`sets` vs `home`/`away` vs `walkover`), and the format is
 * always available separately from `tournaments.scoreFormat`:
 *
 *   - 3 sets / super tiebreak: { "sets": [{ "home": 6, "away": 2 }, ...] }
 *   - basic count:             { "home": 14, "away": 5 }
 *   - walkover (any format):   { "walkover": 1 }   (1 = home, 2 = away)
 *
 * This keeps the column self-contained (no join needed to interpret it) while
 * dropping the redundant format tag, and leaves room to grow: a future
 * "Interclubes" tournament type can store a richer object in the same column
 * (an overall count plus a `matches` array of per-court results shaped just
 * like today's MatchScore) without another migration, since JSONB has no
 * fixed shape.
 *
 * Written against neorm's engine-agnostic Schema API. `jsonb()` compiles to a
 * native JSONB column on PostgreSQL and to TEXT on SQLite (same trick already
 * used for `tournaments.settings` / `rankingSettings`, see 001-create-base-tables).
 * A direct `ALTER COLUMN ... TYPE JSONB` isn't usable here: Postgres has no
 * implicit TEXT→JSONB cast (a `USING` expression can't run the parsing logic
 * below), and SQLite's grammar rejects `ALTER COLUMN` outright. So instead a
 * staging column is added, existing rows are parsed and copied over in JS,
 * and the old column is dropped and the staging one renamed into its place —
 * the same add → backfill → drop pattern as migrations 004 and 005.
 *
 * Idempotent: if `score` no longer looks like the legacy `"{format}:..."`
 * string (or the table is empty), this is a no-op.
 */

const STAGING_COLUMN = 'scoreStructured'
const LEGACY_PREFIX = /^\d+:/

type LegacyScore = { sets?: Array<{ home: number; away: number }>; home?: number; away?: number; walkover?: number }

/** Parses the legacy `"{format}:{body}"` string into the new JSON shape. Mirrors the
 *  soon-to-be-removed `parseScore`/`ScoreFormat.BASIC_COUNT` logic from utils/score.ts,
 *  duplicated here (rather than imported) so this migration stays self-contained and
 *  keeps working unchanged even as the application code evolves. */
function parseLegacyScore(raw: string): LegacyScore | null {
  const separator = raw.indexOf(':')

  if (separator < 0) {
    return null
  }

  const format = Number(raw.slice(0, separator))
  const body = raw.slice(separator + 1)

  if (body.startsWith('wo')) {
    const side = Number(body.slice(2))

    return side === 1 || side === 2 ? { walkover: side } : null
  }

  const parsePair = (token: string): { home: number; away: number } | null => {
    const [home, away] = token.split('-').map((value) => Number(value))

    return Number.isNaN(home) || Number.isNaN(away) ? null : { home, away }
  }

  // BASIC_COUNT = 3
  if (format === 3) {
    const pair = parsePair(body)

    return pair ? { home: pair.home, away: pair.away } : null
  }

  const sets = body
    .split('|')
    .filter((token) => token !== '')
    .map(parsePair)
    .filter((set): set is { home: number; away: number } => set !== null)

  return { sets }
}

export default {
  name: '006-matches-score-jsonb',

  async up(): Promise<void> {
    await DB.transaction(async () => {
      const hasStaging = await Schema.hasColumn('matches', STAGING_COLUMN)

      if (!hasStaging) {
        const sample = await DB.table('matches').whereNotNull('score').select('score').first()
        const looksLegacy =
          sample != null && typeof sample.score === 'string' && LEGACY_PREFIX.test(String(sample.score).trim())

        if (sample != null && !looksLegacy) {
          // score is already structured (JSON object, or a JSON string with no
          // legacy prefix) — nothing left to convert.
          return
        }

        await Schema.table('matches', (table) => {
          table.jsonb(STAGING_COLUMN).nullable()
        })
      }

      const rows = await DB.table('matches').whereNotNull('score').select('id', 'score').get()

      for (const row of rows) {
        const raw = String(row.score)
        const parsed = LEGACY_PREFIX.test(raw.trim()) ? parseLegacyScore(raw) : null

        await DB.table('matches')
          .where('id', Number(row.id))
          .update({ [STAGING_COLUMN]: parsed ? JSON.stringify(parsed) : null })
      }

      await Schema.table('matches', (table) => {
        table.dropColumn('score')
      })

      await Schema.table('matches', (table) => {
        table.renameColumn(STAGING_COLUMN, 'score')
      })
    })
  }
}
