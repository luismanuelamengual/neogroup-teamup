import { isSameRoster } from '@/app/(protected)/(head-to-head)/utils/headToHead'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'

/**
 * Every competitor whose roster is EXACTLY `playerIds`.
 *
 * Exactly, not partially: a head-to-head between "1,2" and "5,6" is between
 * those two pairs, so the match where player 1 faced player 5 alongside other
 * partners is a different matchup and must not be counted. The query narrows on
 * the first player (the array-contains index does the work) and the roster
 * comparison runs in memory over the handful of rows that survive.
 *
 * `whereHas('tournament')` carries no condition of its own: it is there for
 * `Tournament`'s own OrganizationScope, which neorm applies inside the subquery
 * (since 0.0.47), and which is what keeps a member of one club from reading
 * another club's history by typing its player ids into the URL. A competitor
 * always hangs from a tournament, so the constraint costs nothing otherwise.
 */
async function getCompetitorIdsByRoster(playerIds: number[]): Promise<number[]> {
  const competitors = await Competitor.whereArrayContains('playerIds', playerIds[0]).whereHas('tournament').get()

  return competitors.filter((competitor) => isSameRoster(competitor.playerIds ?? [], playerIds)).map(({ id }) => id)
}

/**
 * Every match two sides have played against each other, most recent first.
 *
 * The sides are given as **player** rosters, not competitor ids, because a
 * competitor only exists inside one tournament category while this listing
 * spans them all: it is the whole history between two rivals across the
 * organization, whatever tournament, category or discipline each encounter
 * belonged to. Only matches carrying an outcome are returned — a pending
 * fixture is not history yet, and a voided slot never will be.
 *
 * Each match comes with what it takes to place it (`tournamentCategory` with
 * its tournament and category, plus its own venue) and with both competitors
 * resolved, so the caller can tell which of the two sides played at home in it.
 * Callers that want the sides oriented their own way flip the ones that came
 * back the other way around (`flipScore`, `getOppositeSide`) — this returns
 * matches exactly as they are stored.
 */
export async function getHeadToHeadMatches(homePlayerIds: number[], awayPlayerIds: number[]): Promise<Match[]> {
  if (homePlayerIds.length === 0 || awayPlayerIds.length === 0 || isSameRoster(homePlayerIds, awayPlayerIds)) {
    return []
  }

  const [homeCompetitorIds, awayCompetitorIds] = await Promise.all([
    getCompetitorIdsByRoster(homePlayerIds),
    getCompetitorIdsByRoster(awayPlayerIds)
  ])

  if (homeCompetitorIds.length === 0 || awayCompetitorIds.length === 0) {
    return []
  }

  // Both sides are looked up at once and the actual pairing is resolved below:
  // the two id sets are disjoint (a roster yields at most one competitor per
  // category instance), so this returns the A-vs-B encounters plus, at most,
  // rows where a side met itself — which cannot exist.
  const competitorIds = [...homeCompetitorIds, ...awayCompetitorIds]
  const matches = await Match.whereIn('homeCompetitorId', competitorIds)
    .whereIn('awayCompetitorId', competitorIds)
    .whereIn('status', [MatchStatus.PLAYED, MatchStatus.WALKOVER])
    .with('tournamentCategory.tournament.site', 'tournamentCategory.category', 'site')
    // Only the rosters are needed (to tell the two sides apart), never the
    // player rows themselves — which is also what keeps this listing from
    // serializing user records out to the client.
    .with('homeCompetitor', 'awayCompetitor')
    .get()

  return matches
    .filter((match) => {
      const rival = awayCompetitorIds.includes(match.homeCompetitorId!) ? homeCompetitorIds : awayCompetitorIds

      return match.awayCompetitorId != null && rival.includes(match.awayCompetitorId)
    })
    .sort((a, b) => {
      // Most recent first. Sorted here rather than in the query because a played
      // match may never have been planned (no date at all), and those belong at
      // the BOTTOM of the history — the opposite of where a descending SQL sort
      // puts NULLs. Undated rows fall back to the order they were created in.
      if (a.date !== b.date) {
        if (a.date == null) {
          return 1
        }

        if (b.date == null) {
          return -1
        }

        return a.date < b.date ? 1 : -1
      }

      return b.id - a.id
    })
}
