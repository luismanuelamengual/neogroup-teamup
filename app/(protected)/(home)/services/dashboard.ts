import { OrganizerDashboardDto } from '@/app/(protected)/(home)/models/OrganizerDashboardDto'
import { PlayerDashboardDto } from '@/app/(protected)/(home)/models/PlayerDashboardDto'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getTournaments } from '@/app/(protected)/(tournaments)/services/tournaments'
import { getPodiumCompetitorIds } from '@/app/(protected)/(tournaments)/utils/champion'

const ALL = 1000

/** Orders the nested relations of a tournament so the client can render them directly. */
function normalize(tournament: TournamentDto): TournamentDto {
  if (tournament.competitors) {
    tournament.competitors = [...tournament.competitors].sort((a, b) => a.id - b.id)
  }

  if (tournament.rounds) {
    tournament.rounds = [...tournament.rounds].sort((a, b) => a.number - b.number)
  }

  if (tournament.matches) {
    tournament.matches = [...tournament.matches].sort((a, b) => a.roundId - b.roundId || a.position - b.position)
  }

  return tournament
}

/** Competitor entry of `userId` inside a tournament (as player or partner). */
function findCompetitor(tournament: TournamentDto, userId: number) {
  return (tournament.competitors ?? []).find((c) => c.userId === userId || c.partnerUserId === userId) ?? null
}

/** Aggregates the player home dashboard from every tournament they take part in. */
export async function getPlayerDashboard(userId: number, organizationId: number): Promise<PlayerDashboardDto> {
  const { data } = await getTournaments({
    organizationId,
    playerId: userId,
    withCompetitors: true,
    withRounds: true,
    withMatches: true,
    pageSize: ALL
  })
  const tournaments = data as unknown as TournamentDto[]
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

  const activeTournaments = tournaments
    .filter((tournament) => tournament.status !== TournamentStatus.FINISHED)
    .map(normalize)

  return {
    stats: {
      tournamentsPlayed: tournaments.length,
      activeTournaments: activeTournaments.length,
      matchesPlayed,
      matchesWon,
      winRate: matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : 0,
      titles,
      podiums
    },
    activeTournaments
  }
}

/** Aggregates the organizer home dashboard: own tournaments + organization-wide stats. */
export async function getOrganizerDashboard(userId: number, organizationId: number): Promise<OrganizerDashboardDto> {
  const { data } = await getTournaments({
    organizationId,
    withCompetitors: true,
    withRounds: true,
    withMatches: true,
    pageSize: ALL
  })
  const tournaments = data as unknown as TournamentDto[]
  // Organization-wide stats.
  const players = new Set<number>()
  let orgCompetitors = 0
  let orgActive = 0

  for (const tournament of tournaments) {
    if (tournament.status !== TournamentStatus.FINISHED) {
      orgActive++
    }

    for (const competitor of tournament.competitors ?? []) {
      orgCompetitors++

      if (competitor.userId != null) {
        players.add(competitor.userId)
      }

      if (competitor.partnerUserId != null) {
        players.add(competitor.partnerUserId)
      }
    }
  }

  // Personal (owned) stats.
  const owned = tournaments.filter((tournament) => tournament.ownerId === userId)
  let ownCompetitors = 0
  let ownFinished = 0
  let ownActive = 0
  let matchesPlayed = 0
  let matchesPending = 0

  for (const tournament of owned) {
    ownCompetitors += tournament.competitors?.length ?? 0

    if (tournament.status === TournamentStatus.FINISHED) {
      ownFinished++
    } else {
      ownActive++
    }

    if (tournament.status === TournamentStatus.ONGOING) {
      for (const match of tournament.matches ?? []) {
        if (!match.awayCompetitorIds) {
          continue
        }

        if (match.status === MatchStatus.PENDING) {
          matchesPending++
        } else {
          matchesPlayed++
        }
      }
    }
  }

  const activeTournaments = owned.filter((tournament) => tournament.status !== TournamentStatus.FINISHED).map(normalize)

  return {
    personal: {
      tournamentsTotal: owned.length,
      tournamentsActive: ownActive,
      tournamentsFinished: ownFinished,
      competitorsTotal: ownCompetitors,
      avgCompetitors: owned.length > 0 ? Math.round((ownCompetitors / owned.length) * 10) / 10 : 0,
      matchesPlayed,
      matchesPending
    },
    organization: {
      tournamentsTotal: tournaments.length,
      tournamentsActive: orgActive,
      competitorsTotal: orgCompetitors,
      distinctPlayers: players.size
    },
    activeTournaments
  }
}
