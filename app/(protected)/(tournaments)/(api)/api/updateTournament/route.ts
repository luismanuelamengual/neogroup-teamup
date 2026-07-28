import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { UpdateTournamentInput } from '@/app/(protected)/(tournaments)/models/UpdateTournamentInput'
import { resolveSiteId, setTournamentImage } from '@/app/(protected)/(tournaments)/services/tournaments'
import { normalizeImage, normalizeStartTime } from '@/app/(protected)/(tournaments)/utils/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'
import { Tournament } from '../../../models/Tournament'

/** POST /api/updateTournament — updates the editable attributes (owner only). */
export const POST = withAuth(async (request, _context, _userId, organizationId) => {
  const { id, ...input } = (await request.json()) as UpdateTournamentInput & { id: number }
  const tournament = await Tournament.find(Number(id))

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

  const image = normalizeImage(input.image)

  if (image === false) {
    throw new ApiException('invalidImage')
  }

  tournament.name = name
  tournament.description = input.description?.trim() || null
  tournament.siteId = await resolveSiteId(organizationId, input.siteId)
  tournament.startDate = input.startDate
  tournament.startTime = startTime

  // Registration pricing can only be changed while registrations are open.
  if (input.paid !== undefined && tournament.status === TournamentStatus.STAND_BY) {
    if (input.paid && (!input.entryFee || input.entryFee <= 0)) {
      throw new ApiException('El monto de inscripción debe ser mayor a cero')
    }

    tournament.paid = Boolean(input.paid)
    tournament.entryFee = input.paid && input.entryFee && input.entryFee > 0 ? input.entryFee : null

    if (input.currency) {
      tournament.currency = input.currency.trim() || tournament.currency
    }
  }

  if (input.allowPlayerSetScore !== undefined) {
    tournament.allowPlayerSetScore = Boolean(input.allowPlayerSetScore)
  }

  tournament.updatedAt = new Date()
  await tournament.save()
  await setTournamentImage(tournament.id, image)
})
