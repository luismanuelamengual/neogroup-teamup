import { BRACKET_PLAYOFF } from '@/app/(protected)/(tournaments)/models/Bracket'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'

const KNOCKOUT_TYPES = new Set<TournamentType>([
  TournamentType.PLAYOFF,
  TournamentType.PLAYOFF_WITH_CONSOLATION,
  TournamentType.GROUPS_PLAYOFF
])

/**
 * Final ranking of a tournament category as an ordered list of competitor ids
 * (1st, 2nd, 3rd...). For league/americano/groups it comes from the standings
 * table; for knockout phases it is derived from the final match (champion =
 * winner, runner-up = loser).
 */
export function getPodiumCompetitorIds(tournament: TournamentDto, category: string | null = null): number[] {
  if (!KNOCKOUT_TYPES.has(tournament.type)) {
    return computeStandings(tournament, category)
      .slice(0, 3)
      .map((row) => row.competitorId)
  }

  // Knockout: the decisive structure is the main bracket of the category.
  const mainBracket = tournament.type === TournamentType.GROUPS_PLAYOFF ? BRACKET_PLAYOFF : null
  const rounds = (tournament.rounds ?? []).filter(
    (round) => (round.category ?? null) === category && (round.bracket ?? null) === mainBracket
  )

  if (rounds.length === 0) {
    return []
  }

  const finalRound = rounds.reduce((latest, round) => (round.number > latest.number ? round : latest))
  const finalMatch = (tournament.matches ?? []).find(
    (match) => match.roundId === finalRound.id && match.awayCompetitorIds !== null && match.winner !== null
  )

  if (!finalMatch || finalMatch.winner === null || !finalMatch.awayCompetitorIds) {
    return []
  }

  const winnerIds = finalMatch.winner === MatchSide.HOME ? finalMatch.homeCompetitorIds : finalMatch.awayCompetitorIds
  const loserIds = finalMatch.winner === MatchSide.HOME ? finalMatch.awayCompetitorIds : finalMatch.homeCompetitorIds

  return [winnerIds[0], loserIds[0]].filter((id): id is number => id != null)
}

/** Champion (1st place) competitor id of a tournament category, or null. */
export function getChampionCompetitorId(tournament: TournamentDto, category: string | null = null): number | null {
  return getPodiumCompetitorIds(tournament, category)[0] ?? null
}
