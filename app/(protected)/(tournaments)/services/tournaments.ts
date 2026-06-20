import { Category } from '@/app/(protected)/(tournaments)/models/Category'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { getCategoriesByIds } from '@/app/(protected)/(tournaments)/services/categories'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

export interface TournamentOptions {
  id?: number
  organizationId?: number
  name?: string
  ownerId?: number
  playerId?: number
  status?: TournamentStatus
  onlyActive?: boolean
  withCompetitors?: boolean
  withRounds?: boolean
  withMatches?: boolean
  page?: number
  pageSize?: number
}

/** Attaches the resolved `categories` (id + name) to each tournament from its categoryIds. */
async function attachCategories(tournaments: Tournament[]): Promise<void> {
  const allIds = [...new Set(tournaments.flatMap((tournament) => tournament.categoryIds ?? []))]
  const categories = await getCategoriesByIds(allIds)
  const byId = new Map<number, Category>(categories.map((category) => [category.id, category]))

  for (const tournament of tournaments) {
    tournament.categories = (tournament.categoryIds ?? [])
      .map((id) => byId.get(id))
      .filter((category): category is Category => category != null)
  }
}

export async function getTournaments({
  id,
  organizationId,
  ownerId,
  playerId,
  name,
  status,
  onlyActive = false,
  withCompetitors = false,
  withRounds = false,
  withMatches = false,
  page = 1,
  pageSize = 10
}: TournamentOptions = {}): Promise<PaginatedResponse<Tournament[]>> {
  const result = await Tournament.when(id, (query) => query.where('id', id))
    .when(organizationId, (query) => query.where('organizationId', organizationId))
    .when(ownerId, (query) => query.where('ownerId', ownerId))
    .when(playerId, (query) =>
      query.whereHas('competitors', (q) =>
        q.where((q) => q.where('userId', playerId).orWhere('partnerUserId', playerId))
      )
    )
    .when(name, (query) => query.whereLike('name', '%' + name + '%'))
    .when(status, (query) => query.where('status', status))
    .when(onlyActive, (query) => query.whereIn('status', [TournamentStatus.STAND_BY, TournamentStatus.ONGOING]))
    .when(withCompetitors, (query) => query.with('competitors'))
    .when(withRounds, (query) => query.with('rounds'))
    .when(withMatches, (query) => query.with('matches'))
    .orderBy('status')
    .orderByDesc('id')
    .paginate(pageSize, page)

  await attachCategories(result.data)

  return result
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
