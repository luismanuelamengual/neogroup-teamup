import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { JoinTournamentInput } from '@/app/(protected)/(tournaments)/models/JoinTournamentInput'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import { ApiException } from '@/app/models/ApiException'
import { User } from '@/app/models/User'

export interface ResolvedRegistration {
  targetCategory: TournamentCategory
  /** Validated player roster for the competitor (index 0 is the main player). */
  playerIds: number[]
}

/**
 * Validates a join request against the current tournament state and resolves the
 * target category instance and partner. Throws an ApiException for any rule
 * violation (tournament started, full, already registered, missing partner…).
 *
 * The tournament must be loaded with its `categories` and `competitors`
 * relations. This is shared by the synchronous join (free tournaments) and the
 * Mercado Pago webhook (paid tournaments), so it is re-run at confirmation time
 * to stay correct even if the state changed while the player was paying.
 */
export async function resolveRegistration(
  tournament: Tournament,
  userId: number,
  input: JoinTournamentInput
): Promise<ResolvedRegistration> {
  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('Torneo ya iniciado. Inscripciones cerradas')
  }

  const competitors = tournament.competitors ?? []
  const categories = tournament.categories ?? []
  const realCategories = categories.filter((category) => category.categoryId != null)
  let targetCategory: TournamentCategory | undefined

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

  const categoryCount = competitors.filter((c) => c.tournamentCategoryId === targetCategory!.id).length

  if (categoryCount >= targetCategory.maxCompetitors) {
    throw new ApiException('No se aceptan más inscripciónes (cupo máximo)')
  }

  const alreadyRegistered = competitors.some((competitor) => competitor.playerIds.includes(userId))

  if (alreadyRegistered) {
    throw new ApiException('Usuario ya inscripto en el torneo')
  }

  if (input.partnerUserId) {
    const partnerAlreadyRegistered = competitors.some((competitor) =>
      competitor.playerIds.includes(Number(input.partnerUserId))
    )

    if (partnerAlreadyRegistered) {
      throw new ApiException('Usuario compañero ya inscripto en el torneo')
    }
  }

  const user = await User.find(userId)

  if (!user) {
    throw new ApiException('Usuario no encontrado')
  }

  const playerIds: number[] = [user.id]
  const needsPartner = registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)

  if (needsPartner) {
    if (!input.partnerUserId) {
      throw new ApiException('El usuario compañero es requerido')
    }

    const partner = await User.find(input.partnerUserId)

    if (!partner) {
      throw new ApiException('Usuario compañero no encontrado')
    }

    playerIds.push(partner.id)
  }

  return { targetCategory, playerIds }
}

/** Creates and persists a competitor for a resolved registration. */
export async function createCompetitor(tournamentCategoryId: number, playerIds: number[]): Promise<Competitor> {
  const competitor = new Competitor()

  competitor.tournamentCategoryId = tournamentCategoryId
  competitor.playerIds = playerIds
  competitor.createdAt = new Date()
  await competitor.save()

  return competitor
}
