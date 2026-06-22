import { OrganizationStatsDto } from '@/app/(protected)/(home)/models/OrganizerDashboardDto'
import { PlayerStatsDto } from '@/app/(protected)/(home)/models/PlayerDashboardDto'
import { getOrganizationRankingSummary, getPlayerRankingSummary } from '@/app/(protected)/(rankings)/services/rankings'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getTournaments } from '@/app/(protected)/(tournaments)/services/tournaments'
import { getPodiumCompetitorIds } from '@/app/(protected)/(tournaments)/utils/champion'
import { Tournament } from '../../(tournaments)/models/Tournament'

const ALL = 1000

/** Competitor entry of `userId` inside a tournament (as player or partner). */
function findCompetitor(tournament: Tournament, userId: number) {
  return (tournament.competitors ?? []).find((c) => c.userId === userId || c.partnerUserId === userId) ?? null
}

/** Aggregates player stats from every tournament they take part in. */
export async function getPlayerStats(userId: number): Promise<PlayerStatsDto> {
  const { data } = await getTournaments({
    playerId: userId,
    withCompetitors: true,
    withRounds: true,
    withMatches: true,
    pageSize: ALL
  })
  const tournaments = data as unknown as Tournament[]
  let matchesPlayed = 0
  let matchesWon = 0
  let titles = 0
  let podiums = 0

  for (const tournament of tournaments) {
    const competitor = findCompetitor(tournament, userId)

    if (!competitor) {
      continue
    }

    for (const match of tournament.matches ?? []) {
      if (match.status === MatchStatus.PENDING || !match.awayCompetitorIds) {
        continue
      }

      const onHome = match.homeCompetitorIds.includes(competitor.id)
      const onAway = match.awayCompetitorIds.includes(competitor.id)

      if (!onHome && !onAway) {
        continue
      }

      matchesPlayed++

      const side = onHome ? MatchSide.HOME : MatchSide.AWAY

      if (match.winner === side) {
        matchesWon++
      }
    }

    if (tournament.status === TournamentStatus.FINISHED) {
      try {
        const podium = getPodiumCompetitorIds(tournament, competitor.tournamentCategoryId)

        if (podium[0] === competitor.id) {
          titles++
        }

        if (podium.includes(competitor.id)) {
          podiums++
        }
      } catch (error) {
        // A malformed tournament must not break the whole dashboard.
        // eslint-disable-next-line no-console
        console.error(`[dashboard] Failed to compute podium for tournament ${tournament.id}:`, error)
      }
    }
  }

  const activeTournaments = tournaments.filter((t) => t.status !== TournamentStatus.FINISHED)
  const rankingSummary = await getPlayerRankingSummary(userId)

  return {
    tournamentsPlayed: tournaments.length,
    activeTournaments: activeTournaments.length,
    matchesPlayed,
    matchesWon,
    winRate: matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : 0,
    titles,
    podiums,
    rankingPoints: rankingSummary.points,
    bestRankingPosition: rankingSummary.bestPosition
  }
}

/** Aggregates organization-wide stats from all tournaments in the organization. */
export async function getOrganizationStats(): Promise<OrganizationStatsDto> {
  const { data } = await getTournaments({
    withCompetitors: true,
    withRounds: true,
    withMatches: true,
    pageSize: ALL
  })
  const tournaments = data as unknown as Tournament[]
  const players = new Set<number>()
  let competitorsTotal = 0
  let tournamentsActive = 0
  let tournamentsFinished = 0
  let matchesTotal = 0
  let matchesPlayed = 0
  let matchesPending = 0

  for (const tournament of tournaments) {
    if (tournament.status === TournamentStatus.FINISHED) {
      tournamentsFinished++
    } else {
      tournamentsActive++
    }

    for (const competitor of tournament.competitors ?? []) {
      competitorsTotal++

      if (competitor.userId != null) {
        players.add(competitor.userId)
      }

      if (competitor.partnerUserId != null) {
        players.add(competitor.partnerUserId)
      }
    }

    for (const match of tournament.matches ?? []) {
      if (!match.awayCompetitorIds) {
        continue
      }

      matchesTotal++

      if (match.status === MatchStatus.PENDING) {
        matchesPending++
      } else {
        matchesPlayed++
      }
    }
  }

  const rankingSummary = await getOrganizationRankingSummary()

  return {
    tournamentsTotal: tournaments.length,
    tournamentsActive,
    tournamentsFinished,
    competitorsTotal,
    avgCompetitors: tournaments.length > 0 ? Math.round((competitorsTotal / tournaments.length) * 10) / 10 : 0,
    distinctPlayers: players.size,
    matchesTotal,
    matchesPlayed,
    matchesPending,
    rankingPointsAwarded: rankingSummary.pointsAwarded,
    rankedPlayers: rankingSummary.rankedPlayers
  }
}
