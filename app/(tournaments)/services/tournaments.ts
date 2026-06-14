import { OrderByDirection, Repository } from '@neogroup/neorm'
import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'

export interface TournamentOptions {
  id?: number
  name?: string
  ownerId?: number
  playerId?: number
  onlyActive?: boolean
  withCompetitors?: boolean
  withRounds?: boolean
  withMatches?: boolean
  limit?: number
}

const DEFAULT_TOURNAMENT_OPTIONS: TournamentOptions = {}

export async function getTournaments(options: TournamentOptions = DEFAULT_TOURNAMENT_OPTIONS): Promise<Tournament[]> {
  let tournamentIds: number[] | undefined

  if (options.playerId !== undefined) {
    const entries: Competitor[] = await Repository.get(Competitor)
      .where((group: any) => group.where('userId', options.playerId).orWhere('partnerUserId', options.playerId))
      .get()

    tournamentIds = [...new Set(entries.map((e) => e.tournamentId))]

    if (tournamentIds.length === 0) {
      return []
    }
  }

  const tournaments: Tournament[] = await Repository.get(Tournament)
    .when(options.id, (query) => query.where('id', options.id))
    .when(options.ownerId, (query) => query.where('ownerId', options.ownerId))
    .when(tournamentIds, (query) => query.whereIn('id', tournamentIds!))
    .when(options.name, (query) => query.whereLike('name', '%' + options.name + '%'))
    .when(options.onlyActive, (query) => query.whereIn('status', [TournamentStatus.STAND_BY, TournamentStatus.ONGOING]))
    .when(options.withCompetitors, (query) => query.with('competitors'))
    .when(options.withRounds, (query) => query.with('rounds'))
    .when(options.withMatches, (query) => query.with('matches'))
    .when(options.limit, (query) => query.limit(options.limit!))
    .orderBy('id', OrderByDirection.DESC)
    .get()

  return tournaments
}

export async function getTournament(
  id: number,
  options: TournamentOptions = DEFAULT_TOURNAMENT_OPTIONS
): Promise<Tournament | null> {
  const [tournament = null] = await getTournaments({ ...options, id, limit: 1 })

  if (tournament) {
    if (tournament.competitors) {
      tournament.competitors = [...tournament.competitors].sort((a, b) => a.id - b.id)
    }

    if (tournament.rounds) {
      tournament.rounds = [...tournament.rounds].sort((a, b) => a.number - b.number)
    }

    if (tournament.matches) {
      tournament.matches = [...tournament.matches].sort((a, b) => a.roundId - b.roundId || a.position - b.position)
    }
  }

  return tournament
}
