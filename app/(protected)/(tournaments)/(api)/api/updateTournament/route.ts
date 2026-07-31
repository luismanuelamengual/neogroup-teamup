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
  const startInscriptionsDate = input.startInscriptionsDate?.trim() || null

  if (startInscriptionsDate && startInscriptionsDate > input.startDate) {
    throw new ApiException('La fecha de inicio de inscripciones no puede ser posterior a la fecha de inicio del torneo')
  }

  tournament.startDate = input.startDate
  tournament.startTime = startTime
  tournament.startInscriptionsDate = startInscriptionsDate

  // Registration pricing can only be changed while registrations are open: once
  // the tournament is under way the entry fee is also the base of TeamUp's
  // service fee, so it must stop moving.
  if (input.entryFee !== undefined && tournament.status === TournamentStatus.STAND_BY) {
    if (input.entryFee !== null && input.entryFee <= 0) {
      throw new ApiException('El monto de inscripción debe ser mayor a cero')
    }

    tournament.entryFee = input.entryFee && input.entryFee > 0 ? input.entryFee : null
  }

  if (input.allowPlayerSetScore !== undefined) {
    tournament.allowPlayerSetScore = Boolean(input.allowPlayerSetScore)
  }

  tournament.updatedAt = new Date()
  await tournament.save()
  await setTournamentImage(tournament.id, image)
})
