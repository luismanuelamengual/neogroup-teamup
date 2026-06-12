import { UpdateTournamentInput } from '@/app/(tournaments)/models/inputs'
import { requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { ApiException, withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/[id]/update — updates the editable attributes (owner only). */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const input = (await request.json()) as UpdateTournamentInput
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  const name = input.name.trim()

  if (!name || !input.startDate || input.maxCompetitors < 2) {
    throw new ApiException('missingFields')
  }

  tournament.name = name
  tournament.description = input.description.trim() || null
  tournament.location = input.location.trim() || null
  tournament.startDate = input.startDate
  tournament.maxCompetitors = input.maxCompetitors
  tournament.updatedAt = new Date()
  await tournament.save()
})
