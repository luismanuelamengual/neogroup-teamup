import { Repository } from '@neogroup/neorm'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/[id]/update — updates the editable attributes (owner only). */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const input = (await request.json()) as Partial<Tournament>
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  const name = input.name?.trim() ?? ''

  if (!name || !input.startDate || !input.maxCompetitors || input.maxCompetitors < 2) {
    throw new ApiException('missingFields')
  }

  tournament.name = name
  tournament.description = input.description?.trim() || null
  tournament.location = input.location?.trim() || null
  tournament.startDate = input.startDate
  tournament.maxCompetitors = input.maxCompetitors
  tournament.updatedAt = new Date()
  await Repository.get(Tournament).save(tournament)
})
