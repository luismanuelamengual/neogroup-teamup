import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import { ApiException } from '@/app/models/ApiException'
import { User } from '@/app/models/User'
import { withAuth } from '@/app/utils/api-server'
import { JoinTournamentInput } from '../../../models/JoinTournamentInput'

/** POST /api/joinTournament — registers the signed-in user (optionally with a partner) into a tournament. */
export const POST = withAuth(async (request, context, userId, _organizationId) => {
  const { tournamentId, ...input } = (await request.json()) as JoinTournamentInput & { tournamentId: number }
  const tournament = await Tournament.where('id', Number(tournamentId)).with('categories', 'competitors').first()

  if (!tournament) {
    throw new ApiException('Torneo no encontrado')
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('Torneo ya iniciado. Inscripciones cerradas')
  }

  const competitors = tournament.competitors ?? []
  const categories = tournament.categories ?? []
  const realCategories = categories.filter((category) => category.categoryId != null)
  // Resolve the category instance this entry registers into. When the
  // tournament defines categories the player must pick one; otherwise it is the
  // single category (categoryId = null).
  let targetCategory

  if (realCategories.length > 0) {
    const requested = input.tournamentCategoryId != null ? Number(input.tournamentCategoryId) : null

    if (!requested) {
      throw new ApiException('Se requiere una categoría para la inscripción')
    }

    targetCategory = realCategories.find((category) => category.id === requested)

    if (!targetCategory) {
      throw new ApiException('Categoría inválida')
    }
  } else {
    targetCategory = categories[0]

    if (!targetCategory) {
      throw new ApiException('Categoría inválida')
    }
  }

  // The entry limit always applies per category instance.
  const categoryCount = competitors.filter((c) => c.tournamentCategoryId === targetCategory.id).length

  if (categoryCount >= targetCategory.maxCompetitors) {
    throw new ApiException('No se aceptan más inscripciónes (cupo máximo)')
  }

  const alreadyRegistered = competitors.some(
    (competitor) => competitor.userId === userId || competitor.partnerUserId === userId
  )

  if (alreadyRegistered) {
    throw new ApiException('Usuario ya inscripto en el torneo')
  }

  if (input.partnerUserId) {
    const partnerAlreadyRegistered = competitors.some(
      (competitor) => competitor.userId === input.partnerUserId || competitor.partnerUserId === input.partnerUserId
    )

    if (partnerAlreadyRegistered) {
      throw new ApiException('Usuario compañero ya inscripto en el torneo')
    }
  }

  const user = await User.find(userId)

  if (!user) {
    throw new ApiException('Usuario no encontrado')
  }

  const needsPartner = registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)
  let partnerUserId: number | null = null

  if (needsPartner) {
    if (!input.partnerUserId) {
      throw new ApiException('El usuario compañero es requerido')
    }

    const partner = await User.find(input.partnerUserId)

    if (!partner) {
      throw new ApiException('Usuario compañero no encontrado')
    }

    partnerUserId = partner.id
  }

  const competitor = new Competitor()

  competitor.tournamentCategoryId = targetCategory.id
  competitor.userId = userId
  competitor.partnerUserId = partnerUserId
  competitor.createdAt = new Date()
  await competitor.save()
})
