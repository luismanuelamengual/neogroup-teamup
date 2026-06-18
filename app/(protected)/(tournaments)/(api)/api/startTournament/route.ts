import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { createRound, requireOwnedTournament } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/startTournament — sets the tournament ongoing and generates round 1. */
export const POST = withAuth(async (request, context, userId) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('invalidStatus')
  }

  // Remove categories that have no registered competitors before starting.
  if (tournament.categories && tournament.categories.length > 0) {
    const competitors = await Competitor.where('tournamentId', tournament.id).get()
    const usedCategories = new Set(competitors.map((c) => c.category))
    const filtered = tournament.categories.filter((cat) => usedCategories.has(cat))

    if (filtered.length !== tournament.categories.length) {
      tournament.categories = filtered.length > 0 ? filtered : null
    }
  }

  tournament.status = TournamentStatus.ONGOING
  await createRound(tournament, 1)
  await tournament.save()
})
