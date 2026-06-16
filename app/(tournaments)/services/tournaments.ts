import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

export interface TournamentOptions {
  id?: number
  name?: string
  ownerId?: number
  playerId?: number
  onlyActive?: boolean
  withCompetitors?: boolean
  withRounds?: boolean
  withMatches?: boolean
  page?: number
  pageSize?: number
}

export async function getTournaments({
  id,
  ownerId,
  playerId,
  name,
  onlyActive = false,
  withCompetitors = false,
  withRounds = false,
  withMatches = false,
  page = 1,
  pageSize = 10
}: TournamentOptions = {}): Promise<PaginatedResponse<Tournament[]>> {
  return await Tournament.when(id, (query) => query.where('id', id))
    .when(ownerId, (query) => query.where('ownerId', ownerId))
    .when(playerId, (query) =>
      query.whereHas('competitors', (q) =>
        q.where((q) => q.where('userId', playerId).orWhere('partnerUserId', playerId))
      )
    )
    .when(name, (query) => query.whereLike('name', '%' + name + '%'))
    .when(onlyActive, (query) => query.whereIn('status', [TournamentStatus.STAND_BY, TournamentStatus.ONGOING]))
    .when(withCompetitors, (query) => query.with('competitors'))
    .when(withRounds, (query) => query.with('rounds'))
    .when(withMatches, (query) => query.with('matches'))
    .orderBy('status')
    .orderByDesc('id')
    .paginate(pageSize, page)
}

export async function getTournament(options: TournamentOptions = {}): Promise<Tournament | null> {
  const {
    data: [tournament = null]
  } = await getTournaments({ ...options, pageSize: 1 })

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
