import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { createRound } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import {
  autoAssignPreclassification,
  supportsPreclassification
} from '@/app/(protected)/(tournaments)/utils/preclassification'
import { ApiException } from '@/app/models/ApiException'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

export interface TournamentOptions {
  id?: number
  organizationId?: number
  name?: string
  ownerId?: number
  playerId?: number
  statuses?: TournamentStatus[]
  withCompetitors?: boolean
  withRounds?: boolean
  withMatches?: boolean
  page?: number
  pageSize?: number
}

export async function getTournaments({
  id,
  organizationId,
  ownerId,
  playerId,
  name,
  statuses,
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
    .when(statuses?.length, (query) => query.whereIn('status', statuses!))
    // Every tournament always has at least one category instance; resolve the
    // catalogue category of each so the UI can show its name.
    .with('categories', 'categories.category')
    .when(withCompetitors, (query) => query.with('competitors', 'competitors.user', 'competitors.partnerUser'))
    .when(withRounds, (query) => query.with('rounds'))
    .when(withMatches, (query) => query.with('matches'))
    .orderBy('status')
    .orderByDesc('id')
    .paginate(pageSize, page)

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

/**
 * Starts a tournament: removes empty category instances, auto-assigns
 * preclassification seeds from ranking (for bracket-style tournaments),
 * generates round 1, and marks the tournament as ongoing.
 */
export async function startTournament(tournament: Tournament, organizationId: number): Promise<void> {
  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('invalidStatus')
  }

  // Remove real category instances that have no registered competitors.
  // The single category (categoryId = null) is always kept.
  const categories = await TournamentCategory.where('tournamentId', tournament.id).get()
  const realCategories = categories.filter((category) => category.categoryId != null)
  const allCompetitors = await Competitor.whereIn(
    'tournamentCategoryId',
    categories.map((category) => category.id)
  ).get()

  if (realCategories.length > 0) {
    const usedCategoryIds = new Set(allCompetitors.map((c) => c.tournamentCategoryId))

    for (const category of realCategories) {
      if (!usedCategoryIds.has(category.id)) {
        await category.delete()
      }
    }
  }

  // Auto-assign preclassification seeds from ranking when the tournament type
  // supports it (Playoff, Groups+Playoff, Playoff with consolation).
  if (supportsPreclassification(tournament.type)) {
    await autoAssignPreclassification(allCompetitors, organizationId)
  }

  tournament.status = TournamentStatus.ONGOING
  await createRound(tournament, 1)
  await tournament.save()
}
