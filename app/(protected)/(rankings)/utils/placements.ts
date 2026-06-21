import {
  getRankingScheme,
  KNOCKOUT_STAGE_KEYS,
  knockoutStageKey,
  positionKey,
  RankingScheme
} from '@/app/(protected)/(rankings)/models/RankingSettings'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'

/** A competitor together with the placement key it finished a category in. */
export interface CompetitorPlacement {
  competitorId: number
  placementKey: string
}

/**
 * Finishing placements of a tournament category as a list of competitor →
 * placement-key entries, ready to look up against a RankingSettings.points map.
 *
 *  - League / Americano (POSITION scheme): the standings order maps to
 *    `position_1`, `position_2`, ... `position_N`.
 *  - Knockout (playoff / groups+playoff main bracket): the winner of the final
 *    is `winner`; the loser of each knockout round is placed by how far the
 *    round is from the final (final → `finalist`, semis → `semifinalist`, ...).
 *  - Playoff with consolation: the same, plus the consolation bracket placed
 *    with the `consolation_` prefix.
 */
export function computeCategoryPlacements(
  tournament: TournamentDto,
  tournamentCategoryId: number
): CompetitorPlacement[] {
  const scheme = getRankingScheme(tournament.type)

  if (scheme === RankingScheme.POSITION) {
    return computeStandings(tournament, tournamentCategoryId).map((row, index) => ({
      competitorId: row.competitorId,
      placementKey: positionKey(index + 1)
    }))
  }

  const placements: CompetitorPlacement[] = []

  placements.push(...computeBracketPlacements(tournament, tournamentCategoryId, RoundType.KNOCKOUT, false))

  if (scheme === RankingScheme.KNOCKOUT_WITH_CONSOLATION) {
    placements.push(...computeBracketPlacements(tournament, tournamentCategoryId, RoundType.KNOCKOUT_CONSOLATION, true))
  }

  return placements
}

/** Placements of a single knockout bracket (main or consolation) of a category. */
function computeBracketPlacements(
  tournament: TournamentDto,
  tournamentCategoryId: number,
  roundType: RoundType,
  consolation: boolean
): CompetitorPlacement[] {
  const rounds = (tournament.rounds ?? [])
    .filter(
      (round) =>
        round.tournamentCategoryId === tournamentCategoryId &&
        round.type === roundType &&
        (round.settings?.groupNumber ?? null) === null
    )
    .sort((a, b) => a.number - b.number)

  if (rounds.length === 0) {
    return []
  }

  const finalRoundNumber = Math.max(...rounds.map((round) => round.number))
  const placements: CompetitorPlacement[] = []

  for (const round of rounds) {
    const distance = finalRoundNumber - round.number
    const stage = KNOCKOUT_STAGE_KEYS[distance]

    if (!stage) {
      continue
    }

    const loserKey = knockoutStageKey(stage, consolation)
    const matches = (tournament.matches ?? []).filter(
      (match) => match.roundId === round.id && match.awayCompetitorIds && match.winner !== null
    )

    for (const match of matches) {
      const loserIds = match.winner === MatchSide.HOME ? match.awayCompetitorIds : match.homeCompetitorIds

      for (const competitorId of loserIds ?? []) {
        placements.push({ competitorId, placementKey: loserKey })
      }

      // The winner of the final round is the bracket champion.
      if (round.number === finalRoundNumber) {
        const winnerIds = match.winner === MatchSide.HOME ? match.homeCompetitorIds : match.awayCompetitorIds

        for (const competitorId of winnerIds ?? []) {
          placements.push({ competitorId, placementKey: knockoutStageKey('winner', consolation) })
        }
      }
    }
  }

  return placements
}
