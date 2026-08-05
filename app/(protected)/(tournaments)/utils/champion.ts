import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import { Tournament } from '../models/Tournament'

const KNOCKOUT_TYPES = new Set<TournamentType>([
  TournamentType.PLAYOFF,
  TournamentType.GROUPS_PLAYOFF,
  // Interclubes ends in a bracket whenever it has more than 4 teams; the small
  // home-and-away variant produces no bracket and is handled below.
  TournamentType.INTERCLUBS
])

/**
 * Final ranking of a tournament category as an ordered list of competitor ids
 * (1st, 2nd, 3rd...). For league/americano/groups it comes from the standings
 * table; for knockout phases it is derived from the final match (champion =
 * winner, runner-up = loser).
 */
export function getPodiumCompetitorIds(tournament: Tournament, category: number | null = null): number[] {
  if (!KNOCKOUT_TYPES.has(tournament.type)) {
    return computeStandings(tournament, category)
      .slice(0, 3)
      .map((row) => row.competitorId)
  }

  // Knockout: the decisive structure is the main knockout bracket of the category.
  // The final is the bracket match at bracketInstance 1.
  const bracketMatches = (tournament.matches ?? []).filter(
    (match) =>
      (category == null || match.tournamentCategoryId === category) &&
      match.type === MatchType.BRACKET &&
      (match.groupNumber ?? null) === null
  )

  if (bracketMatches.length === 0) {
    // Groups+playoff always builds a bracket, single group included, so getting
    // here means it could not be built at all (fewer than 2 qualifiers). Fall
    // back to the first group's standings rather than reporting no podium.
    if (tournament.type === TournamentType.GROUPS_PLAYOFF) {
      return computeStandings(tournament, category, 0)
        .slice(0, 3)
        .map((row) => row.competitorId)
    }

    // Small interclubes (2–4 teams): the home-and-away league IS the tournament,
    // and it runs in the group-less lane.
    if (tournament.type === TournamentType.INTERCLUBS) {
      return computeStandings(tournament, category)
        .slice(0, 3)
        .map((row) => row.competitorId)
    }

    return []
  }

  const finalMatch = bracketMatches.find(
    (match) => match.bracketInstance === 1 && match.awayCompetitorId !== null && match.winner !== null
  )

  if (!finalMatch || finalMatch.winner === null || finalMatch.awayCompetitorId == null) {
    return []
  }

  const winnerId = finalMatch.winner === MatchSide.HOME ? finalMatch.homeCompetitorId : finalMatch.awayCompetitorId
  const loserId = finalMatch.winner === MatchSide.HOME ? finalMatch.awayCompetitorId : finalMatch.homeCompetitorId

  return [winnerId, loserId].filter((id): id is number => id != null)
}

/** Champion (1st place) competitor id of a tournament category, or null. */
export function getChampionCompetitorId(tournament: Tournament, category: number | null = null): number | null {
  return getPodiumCompetitorIds(tournament, category)[0] ?? null
}
