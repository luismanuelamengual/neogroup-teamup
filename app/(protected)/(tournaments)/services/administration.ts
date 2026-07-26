import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { validateCategoryIds } from '@/app/(protected)/(tournaments)/services/categories'
import {
  assignSiteLabels,
  createCompetitor,
  resolveTeamData,
  resolveTeamRoster
} from '@/app/(protected)/(tournaments)/services/registrations'
import { registersAsPairs, registersAsTeam } from '@/app/(protected)/(tournaments)/utils/discipline'
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
 * Adds a category instance to a tournament. The category is picked from the
 * organization catalogue (the administrator's /categories ABM) and must match
 * the tournament's discipline + sub-discipline, exactly like tournament
 * creation does. A category already present in the tournament is rejected.
 */
export async function addTournamentCategory(
  tournament: Tournament,
  organizationId: number,
  categoryId: number,
  maxCompetitors: number
): Promise<TournamentCategory> {
  if (!maxCompetitors || maxCompetitors < 2) {
    throw new ApiException('El cupo máximo debe ser al menos 2')
  }

  const [resolvedCategoryId] = await validateCategoryIds(
    organizationId,
    tournament.discipline,
    [Number(categoryId)].filter((id) => Number.isInteger(id) && id > 0)
  )

  if (!resolvedCategoryId) {
    throw new ApiException('La categoría seleccionada no es válida')
  }

  const existing = tournament.categories ?? []

  if (existing.some((category) => category.categoryId === resolvedCategoryId)) {
    throw new ApiException('La categoría ya existe en el torneo')
  }

  const tournamentCategory = new TournamentCategory()

  tournamentCategory.tournamentId = tournament.id
  tournamentCategory.categoryId = resolvedCategoryId
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
 * Registers a competitor into a specific category on behalf of the organizer:
 * a single player, a pair, or a whole interclubes team (with the venue it
 * represents). Only free tournaments are supported — paid tournaments must go
 * through the Mercado Pago checkout flow.
 *
 * `playerIds` follows the same convention as the player-facing join: index 0 is
 * the main player (team captain in interclubes) and the rest are their partner
 * or team mates.
 */
export async function registerCompetitor(
  tournament: Tournament,
  tournamentCategoryId: number,
  playerIds: number[],
  siteId: number | null = null
): Promise<Competitor> {
  if (tournament.paid && tournament.entryFee && tournament.entryFee > 0) {
    throw new ApiException('Los torneos pagos se inscriben mediante el flujo de pago')
  }

  const categories = tournament.categories ?? []
  const targetCategory = categories.find((category) => category.id === Number(tournamentCategoryId))

  if (!targetCategory) {
    throw new ApiException('Categoría inválida')
  }

  const [rawUserId, ...rawMateIds] = playerIds
  const userId = Number(rawUserId)
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

  const mateIds = [...new Set(rawMateIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]

  if (registersAsTeam(tournament.type)) {
    const roster = await resolveTeamRoster(user.id, mateIds, competitors)
    const data = await resolveTeamData(tournament.organizationId, siteId)

    return createCompetitor(targetCategory.id, roster, data)
  }

  const needsPartner = registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)
  const resolvedPlayerIds: number[] = [user.id]

  if (needsPartner) {
    const [partnerUserId] = mateIds

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

  const previousCategoryId = competitor.tournamentCategoryId

  // The competitor keeps its (manually-set) seed across the category change,
  // but a category may never have two seeded competitors sharing the same
  // number: displace whoever already holds that seed in the destination
  // category, falling back to ranking-based assignment when the tournament
  // starts (see autoAssignPreclassification).
  if (competitor.seedNumber != null) {
    const conflicting = await Competitor.where('tournamentCategoryId', targetCategory.id)
      .where('seedNumber', competitor.seedNumber)
      .where('id', '<>', competitor.id)
      .first()

    if (conflicting) {
      conflicting.seedNumber = null
      await conflicting.save()
    }
  }

  competitor.tournamentCategoryId = targetCategory.id
  await competitor.save()

  // Team labels are relative to the other teams of their category, so BOTH the
  // category it left and the one it joined may need to be renamed.
  await assignSiteLabels(previousCategoryId)
  await assignSiteLabels(targetCategory.id)

  return competitor
}

/**
 * Manually sets (or clears) a competitor's preclassification seed number, on
 * behalf of the organizer. Before the tournament starts, a non-null
 * `seedNumber` can only come from here, so it is what `autoAssignPreclassification`
 * treats as a manual seed and gives priority over ranking (see that function).
 *
 * A tournament category may never have two seeded competitors sharing the
 * same number: if `seedNumber` is already held by another competitor in the
 * same category, that other competitor is displaced — its seed is cleared,
 * falling back to ranking-based assignment at tournament start.
 */
export async function setCompetitorSeed(
  tournament: Tournament,
  competitorId: number,
  seedNumber: number | null
): Promise<Competitor> {
  const categoryIds = new Set((tournament.categories ?? []).map((category) => category.id))
  const competitor = await Competitor.find(Number(competitorId))

  if (!competitor || !categoryIds.has(competitor.tournamentCategoryId)) {
    throw new ApiException('Competidor no encontrado')
  }

  if (seedNumber == null) {
    competitor.seedNumber = null
    await competitor.save()

    return competitor
  }

  const normalizedSeed = Number(seedNumber)

  if (!Number.isInteger(normalizedSeed) || normalizedSeed < 1) {
    throw new ApiException('El seed debe ser un número entero mayor a cero')
  }

  const conflicting = await Competitor.where('tournamentCategoryId', competitor.tournamentCategoryId)
    .where('seedNumber', normalizedSeed)
    .where('id', '<>', competitor.id)
    .first()

  if (conflicting) {
    conflicting.seedNumber = null
    await conflicting.save()
  }

  competitor.seedNumber = normalizedSeed
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

  const tournamentCategoryId = competitor.tournamentCategoryId

  await competitor.delete()
  // Losing a team can turn "Alemán A" / "Alemán B" back into a single "Alemán".
  await assignSiteLabels(tournamentCategoryId)
}
