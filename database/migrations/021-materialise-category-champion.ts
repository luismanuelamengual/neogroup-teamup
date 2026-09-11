import { DB, Schema } from '@neogroup/neorm'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getChampionCompetitorId } from '@/app/(protected)/(tournaments)/utils/champion'

/**
 * Makes the home dashboard's player statistics cheap to compute.
 *
 * Two changes, both in service of `services/dashboard.ts`:
 *
 *  1. `tournament_categories.championCompetitorId` — the winner of a finished
 *     category, materialised. It used to be re-derived on every dashboard load:
 *     the player stats query pulled every match of every category the player had
 *     ever finished, rebuilt a tournament-shaped object per category in memory
 *     and ran the podium engine over it, just to count titles. The champion can
 *     only change while the tournament is ONGOING (`setMatchResult` refuses a
 *     result on anything else), so once it is FINISHED the value is immutable and
 *     worth storing: counting titles becomes a single indexed COUNT.
 *
 *     Backfilled here for every already-finished tournament, and written from
 *     then on inside `finishTournament`'s transaction.
 *
 *     Deliberately not a foreign key: `competitors` rows are deleted when a
 *     registration is withdrawn (and cascade with the tournament), and a
 *     dangling id in a cached statistic must never be able to block that. It is
 *     indexed instead, which is all the lookup needs.
 *
 *  2. `player_statistics.podiums` is dropped. The column existed only to back the
 *     "Podios" dashboard card, whose value came from the same expensive podium
 *     reconstruction described above, and which had an inconsistent meaning
 *     anyway (top 3 of the standings in league/americano, but only the two
 *     finalists in a knockout, which has no third place).
 *
 * Idempotent: each step is guarded by a column probe, so re-running it (or
 * running it against a database created after this change) is a no-op — the
 * backfill included, which is driven by "which categories are still null"
 * rather than by the schema change. Deliberately NOT wrapped in a single
 * transaction, unlike the purely structural migrations: the backfill walks the
 * whole history of finished tournaments, and holding one lock over all of it
 * would be worse than being able to resume an interrupted run.
 */

/** How many tournaments are hydrated at once while backfilling champions. */
const BACKFILL_CHUNK_SIZE = 20

/**
 * Fills `championCompetitorId` for every category of a FINISHED tournament that
 * does not have one yet.
 *
 * Hydrates the tournaments through the model (competitors + matches eagerly
 * loaded, in the same order `getTournaments` uses) because that is exactly the
 * shape `getChampionCompetitorId` expects — standings-based types read the
 * competitors, knockout types read the bracket. Done in chunks so a database
 * with a long history never holds every match of every tournament in memory at
 * once.
 *
 * Driven by "which categories are still null" rather than by the column having
 * just been created, so it is safe to replay: on a second run the only rows it
 * reconsiders are the ones a champion genuinely cannot be derived for (a
 * category whose final was never played).
 */
async function backfillChampions(): Promise<void> {
  const pendingIds = (
    await DB.table('tournament_categories')
      .alias('tc')
      .innerJoin('tournaments', 'tournaments.id', 'tc.tournamentId')
      .distinct()
      .select('tc.tournamentId AS tid')
      .where('tournaments.status', TournamentStatus.FINISHED)
      .whereNull('tc.championCompetitorId')
      .get()
  ).map((row) => Number(row.tid))

  for (let index = 0; index < pendingIds.length; index += BACKFILL_CHUNK_SIZE) {
    const chunk = pendingIds.slice(index, index + BACKFILL_CHUNK_SIZE)
    // Global scopes off: a migration runs without a session, so there is no
    // organization to scope to and every tournament must be visible.
    const tournaments = await Tournament.withoutGlobalScopes()
      .whereIn('id', chunk)
      .with('categories')
      .with({ competitors: (query) => query.orderBy('seedNumber').orderBy('id') })
      .with({ matches: (query) => query.orderBy('roundNumber').orderBy('position') })
      .get()

    for (const tournament of tournaments) {
      for (const category of tournament.categories ?? []) {
        let championCompetitorId: number | null = null

        try {
          championCompetitorId = getChampionCompetitorId(tournament, category.id)
        } catch {
          // A malformed historical tournament must not abort the migration: it
          // simply keeps a null champion, exactly like one whose final was never
          // played.
          championCompetitorId = null
        }

        if (championCompetitorId != null) {
          await DB.table('tournament_categories').where('id', category.id).update({ championCompetitorId })
        }
      }
    }
  }
}

export default {
  name: '021-materialise-category-champion',

  async up(): Promise<void> {
    if (!(await Schema.hasColumn('tournament_categories', 'championCompetitorId'))) {
      await Schema.table('tournament_categories', (table) => {
        table.integer('championCompetitorId').nullable()
        table.index('championCompetitorId', 'idx_tournament_categories_champion')
      })
    }

    await backfillChampions()

    if (await Schema.hasColumn('player_statistics', 'podiums')) {
      await Schema.table('player_statistics', (table) => {
        table.dropColumn('podiums')
      })

      // SQLite has no ALTER TABLE DROP COLUMN, so neorm implements the drop as a
      // table rebuild. It carries over the foreign keys and every *named* index,
      // but not the anonymous index behind an inline UNIQUE column constraint —
      // and `playerId` is unique exactly that way (migration 001). Losing it
      // would break the cache's `ON CONFLICT (playerId)` upsert, so it is put
      // back explicitly. PostgreSQL performs a real ALTER and keeps its own
      // constraint, hence the driver check (same trade-off as migration 018).
      if ((process.env.DB_DRIVER ?? 'postgres') === 'sqlite') {
        await DB.execute(
          'CREATE UNIQUE INDEX IF NOT EXISTS uq_player_statistics_player ON player_statistics (playerId)'
        )
      }
    }
  }
}
