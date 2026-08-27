import {
  getRankingScheme,
  KNOCKOUT_STAGE_KEYS,
  knockoutStageKey,
  positionKey,
  RankingScheme
} from '@/app/(protected)/(rankings)/models/RankingSettings'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'
import { Tournament } from '../../(tournaments)/models/Tournament'

/**
 * Stage keys the top of a bracket-less standings table maps to, in order: the
 * league winner is the champion, the runner-up is the "finalist", and the next
 * two are placed as "semifinalists".
 */
const LEAGUE_STAGE_KEYS = ['winner', 'finalist', 'semifinalist', 'semifinalist']

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
 *    A round that never got a result still places both of its competitors at
 *    that round's loser placement — reaching the round already guarantees
 *    that floor to both sides — while only the placement for WINNING it is
 *    withheld (see `computeBracketPlacements`).
 *  - Playoff with consolation: the same, plus the consolation bracket placed
 *    with the `consolation_` prefix.
 *  - Interclubes: the knockout mapping above, except for the small home-and-away
 *    variant (2–4 teams), which has no bracket at all and is placed from its
 *    final standings onto the same stage keys.
 */
export function computeCategoryPlacements(tournament: Tournament, tournamentCategoryId: number): CompetitorPlacement[] {
  const scheme = getRankingScheme(tournament.type, tournament.settings)

  if (scheme === RankingScheme.POSITION) {
    return computeStandings(tournament, tournamentCategoryId).map((row, index) => ({
      competitorId: row.competitorId,
      placementKey: positionKey(index + 1)
    }))
  }

  const placements: CompetitorPlacement[] = []

  placements.push(...computeBracketPlacements(tournament, tournamentCategoryId, MatchType.BRACKET, false))

  // A bracket-less interclubes (2–4 teams, played home and away) still has a
  // champion and a runner-up: read them off the standings so the configured
  // ranking points are awarded all the same.
  if (placements.length === 0 && tournament.type === TournamentType.INTERCLUBS) {
    return computeStandings(tournament, tournamentCategoryId)
      .slice(0, LEAGUE_STAGE_KEYS.length)
      .map((row, index) => ({ competitorId: row.competitorId, placementKey: LEAGUE_STAGE_KEYS[index] }))
  }

  if (scheme === RankingScheme.KNOCKOUT_WITH_CONSOLATION) {
    placements.push(...computeBracketPlacements(tournament, tournamentCategoryId, MatchType.CONSOLATION_BRACKET, true))
  }

  return placements
}

/** Placements of a single knockout bracket (main or consolation) of a category. */
function computeBracketPlacements(
  tournament: Tournament,
  tournamentCategoryId: number,
  matchType: MatchType,
  consolation: boolean
): CompetitorPlacement[] {
  const bracketMatches = (tournament.matches ?? []).filter(
    (match) =>
      match.tournamentCategoryId === tournamentCategoryId &&
      match.type === matchType &&
      (match.groupNumber ?? null) === null
  )

  if (bracketMatches.length === 0) {
    return []
  }

  const finalRoundNumber = Math.max(...bracketMatches.map((match) => match.roundNumber))
  const placements: CompetitorPlacement[] = []

  for (const match of bracketMatches) {
    // Not a real, fully-defined matchup yet (a bye, or a bracket slot the
    // tournament hasn't reached) — nothing to place either side at.
    if (match.homeCompetitorId == null || match.awayCompetitorId == null) {
      continue
    }

    const distance = finalRoundNumber - match.roundNumber
    const stage = KNOCKOUT_STAGE_KEYS[distance]

    if (!stage) {
      continue
    }

    const loserKey = knockoutStageKey(stage, consolation)

    if (match.winner === null) {
      // Real matchup, no result yet (e.g. the tournament was finished with a
      // pending final). Whoever loses it can fall no further than this
      // round's placement — getting here already guarantees that floor to
      // BOTH competitors — so both share it. The placement for WINNING this
      // round stays genuinely undetermined and is withheld from both rather
      // than guessed or split.
      placements.push({ competitorId: match.homeCompetitorId, placementKey: loserKey })
      placements.push({ competitorId: match.awayCompetitorId, placementKey: loserKey })
      continue
    }

    const loserId = match.winner === MatchSide.HOME ? match.awayCompetitorId : match.homeCompetitorId

    placements.push({ competitorId: loserId, placementKey: loserKey })

    // The winner of the final round is the bracket champion.
    if (match.roundNumber === finalRoundNumber) {
      const winnerId = match.winner === MatchSide.HOME ? match.homeCompetitorId : match.awayCompetitorId

      placements.push({ competitorId: winnerId, placementKey: knockoutStageKey('winner', consolation) })
    }
  }

  return placements
}
