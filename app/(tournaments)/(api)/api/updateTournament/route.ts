import { Repository } from '@neogroup/neorm'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { normalizeStartTime } from '@/app/(tournaments)/utils/tournament'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/updateTournament — updates the editable attributes (owner only). */
export const POST = withAuth(async (request, context, userId) => {
  const { id, ...input } = (await request.json()) as Partial<Tournament> & { id: number }
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  const name = input.name?.trim() ?? ''

  if (!name || !input.startDate || !input.maxCompetitors || input.maxCompetitors < 2) {
    throw new ApiException('missingFields')
  }

  const startTime = normalizeStartTime(input.startTime)

  if (startTime === false) {
    throw new ApiException('invalidTime')
  }

  tournament.name = name
  tournament.description = input.description?.trim() || null
  tournament.location = input.location?.trim() || null
  tournament.startDate = new Date(input.startDate as any)
  tournament.startTime = startTime
  tournament.maxCompetitors = input.maxCompetitors
  tournament.updatedAt = new Date()
  await Repository.get(Tournament).save(tournament)
})
