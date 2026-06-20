import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
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

  // Remove real category instances that have no registered competitors before
  // starting. The single category (categoryId = null) is always kept.
  const categories = await TournamentCategory.where('tournamentId', tournament.id).get()
  const realCategories = categories.filter((category) => category.categoryId != null)

  if (realCategories.length > 0) {
    const competitors = await Competitor.whereIn(
      'tournamentCategoryId',
      categories.map((category) => category.id)
    ).get()
    const usedCategoryIds = new Set(competitors.map((competitor) => competitor.tournamentCategoryId))

    for (const category of realCategories) {
      if (!usedCategoryIds.has(category.id)) {
        await category.delete()
      }
    }
  }

  tournament.status = TournamentStatus.ONGOING
  await createRound(tournament, 1)
  await tournament.save()
})
