import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { requireOwnedTournament } from '@/app/(protected)/(tournaments)/services/tournament-helpers'
import { normalizeStartTime } from '@/app/(protected)/(tournaments)/utils/tournament'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/updateTournament — updates the editable attributes (owner only). */
export const POST = withAuth(async (request, context, userId) => {
  const { id, ...input } = (await request.json()) as Partial<TournamentDto> & { id: number }
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  const name = input.name?.trim() ?? ''

  if (!name || !input.startDate) {
    throw new ApiException('missingFields')
  }

  const startTime = normalizeStartTime(input.startTime)

  if (startTime === false) {
    throw new ApiException('invalidTime')
  }

  tournament.name = name
  tournament.description = input.description?.trim() || null
  tournament.location = input.location?.trim() || null
  tournament.startDate = input.startDate
  tournament.startTime = startTime
  tournament.updatedAt = new Date()
  await tournament.save()
})
