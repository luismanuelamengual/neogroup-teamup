import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { resolveCategoryIds } from '@/app/(protected)/(tournaments)/services/categories'
import { createCompetitor } from '@/app/(protected)/(tournaments)/services/registrations'
import { registersAsPairs } from '@/app/(protected)/(tournaments)/utils/discipline'
import { ApiException } from '@/app/models/ApiException'
import { User } from '@/app/models/User'

/**
 * Organizer-only management of a tournament while it is still in the
 * registration phase (STAND_BY). Everything here mutates categories or
 * competitors before the tournament starts, so it is deliberately gated to the
 * tournament owner and the STAND_BY status.
 */

/**
 * Loads a tournament (org-scoped by the model's global scope) and asserts the
 * caller may administrate it: they must own it and it must still be in the
 * registration phase. Loads `categories` and `competitors` for validation.
 */
export async function loadManageableTournament(tournamentId: number, userId: number): Promise<Tournament> {
  const tournament = await Tournament.where('id', Number(tournamentId))
    .with('categories', 'categories.category', 'competitors')
    .first()

  if (!tournament) {
    throw new ApiException('Torneo no encontrado', 404)
  }

  if (tournament.ownerId !== userId) {
    throw new ApiException('No autorizado para administrar este torneo', 403)
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('El torneo no está en fase de inscripción')
  }

  return tournament
}

/** Number of competitors currently registered in a category instance. */
async function countCompetitors(tournamentCategoryId: number): Promise<number> {
  const competitors = await Competitor.where('tournamentCategoryId', tournamentCategoryId).get()

  return competitors.length
}

/**
 * Adds a category instance to a tournament. The name is resolved to a catalogue
 * category (created on demand) for the tournament's organization + discipline +
 * sub-discipline, exactly like tournament creation does. A category already
 * present in the tournament is rejected.
 */
export async function addTournamentCategory(
  tournament: Tournament,
  organizationId: number,
  name: string,
  maxCompetitors: number
): Promise<TournamentCategory> {
  const trimmed = name.trim()

  if (!trimmed) {
    throw new ApiException('El nombre de la categoría es requerido')
  }

  if (!maxCompetitors || maxCompetitors < 2) {
    throw new ApiException('El cupo máximo debe ser al menos 2')
  }

  const [categoryId] = await resolveCategoryIds(organizationId, tournament.discipline, tournament.subDiscipline, [
    trimmed
  ])

  if (!categoryId) {
    throw new ApiException('No se pudo resolver la categoría')
  }

  const existing = tournament.categories ?? []

  if (existing.some((category) => category.categoryId === categoryId)) {
    throw new ApiException('La categoría ya existe en el torneo')
  }

  const tournamentCategory = new TournamentCategory()

  tournamentCategory.tournamentId = tournament.id
  tournamentCategory.categoryId = categoryId
  tournamentCategory.maxCompetitors = Math.floor(maxCompetitors)
  await tournamentCategory.save()

  return tournamentCategory
}

/**
 * Removes a category instance from a tournament. Only allowed when the category
 * has no registered competitors and it is not the tournament's last category
 * (a tournament must always keep at least one).
 */
export async function removeTournamentCategory(tournament: Tournament, tournamentCategoryId: number): Promise<void> {
  const category = await TournamentCategory.find(Number(tournamentCategoryId))

  if (!category || category.tournamentId !== tournament.id) {
    throw new ApiException('Categoría no encontrada')
  }

  const categories = tournament.categories ?? []

  if (categories.length <= 1) {
    throw new ApiException('El torneo debe tener al menos una categoría')
  }

  if ((await countCompetitors(category.id)) > 0) {
    throw new ApiException('No se puede quitar una categoría con competidores inscriptos')
  }

  await category.delete()
}

/**
 * Registers a competitor (optionally with a partner) into a specific category,
 * on behalf of the organizer. Only free tournaments are supported — paid
 * tournaments must go through the Mercado Pago checkout flow.
 */
export async function registerCompetitor(
  tournament: Tournament,
  tournamentCategoryId: number,
  playerIds: number[]
): Promise<Competitor> {
  if (tournament.paid && tournament.entryFee && tournament.entryFee > 0) {
    throw new ApiException('Los torneos pagos se inscriben mediante el flujo de pago')
  }

  const categories = tournament.categories ?? []
  const targetCategory = categories.find((category) => category.id === Number(tournamentCategoryId))

  if (!targetCategory) {
    throw new ApiException('Categoría inválida')
  }

  // Main player at index 0, optional partner at index 1 (for pair disciplines).
  const [rawUserId, rawPartnerId] = playerIds
  const userId = Number(rawUserId)
  const partnerUserId = rawPartnerId != null ? Number(rawPartnerId) : null

  const user = await User.find(userId)

  if (!user) {
    throw new ApiException('Usuario no encontrado')
  }

  const competitors = tournament.competitors ?? []

  if (competitors.some((c) => c.playerIds.includes(user.id))) {
    throw new ApiException('Usuario ya inscripto en el torneo')
  }

  const count = competitors.filter((c) => c.tournamentCategoryId === targetCategory.id).length

  if (count >= targetCategory.maxCompetitors) {
    throw new ApiException('No se aceptan más inscripciones (cupo máximo)')
  }

  const needsPartner = registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)
  const resolvedPlayerIds: number[] = [user.id]

  if (needsPartner) {
    if (!partnerUserId) {
      throw new ApiException('El usuario compañero es requerido')
    }

    if (partnerUserId === user.id) {
      throw new ApiException('El compañero debe ser un jugador distinto')
    }

    const partner = await User.find(partnerUserId)

    if (!partner) {
      throw new ApiException('Usuario compañero no encontrado')
    }

    if (competitors.some((c) => c.playerIds.includes(partner.id))) {
      throw new ApiException('Usuario compañero ya inscripto en el torneo')
    }

    resolvedPlayerIds.push(partner.id)
  }

  return createCompetitor(targetCategory.id, resolvedPlayerIds)
}

/** Moves a competitor to another category instance of the same tournament. */
export async function moveCompetitor(
  tournament: Tournament,
  competitorId: number,
  targetTournamentCategoryId: number
): Promise<Competitor> {
  const categoryIds = new Set((tournament.categories ?? []).map((category) => category.id))
  const competitor = await Competitor.find(Number(competitorId))

  if (!competitor || !categoryIds.has(competitor.tournamentCategoryId)) {
    throw new ApiException('Competidor no encontrado')
  }

  const targetCategory = (tournament.categories ?? []).find(
    (category) => category.id === Number(targetTournamentCategoryId)
  )

  if (!targetCategory) {
    throw new ApiException('Categoría destino inválida')
  }

  if (competitor.tournamentCategoryId === targetCategory.id) {
    throw new ApiException('El competidor ya está en esa categoría')
  }

  const count = (tournament.competitors ?? []).filter((c) => c.tournamentCategoryId === targetCategory.id).length

  if (count >= targetCategory.maxCompetitors) {
    throw new ApiException('La categoría destino alcanzó su cupo máximo')
  }

  competitor.tournamentCategoryId = targetCategory.id
  await competitor.save()

  return competitor
}

/** Removes a competitor registration from the tournament. */
export async function unregisterCompetitor(tournament: Tournament, competitorId: number): Promise<void> {
  const categoryIds = new Set((tournament.categories ?? []).map((category) => category.id))
  const competitor = await Competitor.find(Number(competitorId))

  if (!competitor || !categoryIds.has(competitor.tournamentCategoryId)) {
    throw new ApiException('Competidor no encontrado')
  }

  await competitor.delete()
}
