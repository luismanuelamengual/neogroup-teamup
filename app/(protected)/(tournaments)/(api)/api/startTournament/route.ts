import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { createRound, requireOwnedTournament } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/startTournament — sets the tournament ongoing and generates round 1. */
export const POST = withAuth(async (request, context, userId, _organizationId) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('invalidStatus')
  }

  // Remove categories that have no registered competitors before starting.
  if (tournament.categoryIds && tournament.categoryIds.length > 0) {
    const competitors = await Competitor.where('tournamentId', tournament.id).get()
    const usedCategoryIds = new Set(competitors.map((c) => c.categoryId))
    const filtered = tournament.categoryIds.filter((categoryId) => usedCategoryIds.has(categoryId))

    if (filtered.length !== tournament.categoryIds.length) {
      tournament.categoryIds = filtered.length > 0 ? filtered : null
    }
  }

  tournament.status = TournamentStatus.ONGOING
  await createRound(tournament, 1)
  await tournament.save()
})
