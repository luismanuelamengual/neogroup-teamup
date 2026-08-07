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
import { getLateRegistrationSlots, LateRegistrationSlot } from '@/app/(protected)/(tournaments)/utils/lateRegistration'
import { attachLateCompetitor } from '@/app/(protected)/(tournaments)/utils/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'

/**
 * Organizer-only management of a tournament.
 *
 * While the tournament is still in its registration phase (STAND_BY) everything
 * here is open: categories and competitors can be added, moved and removed
 * freely, because nothing has been played and no structure exists yet.
 *
 * Once it starts, all of that closes — the structure IS the tournament and no
 * administrative action may alter it. The single exception is registering a
 * competitor, and only where the structure already has a hole shaped like them
 * (a knockout bye, an odd group's rest slot): see utils/lateRegistration.
 */

/**
 * Loads a tournament (org-scoped by the model's global scope) and asserts the
 * caller may administrate it: they must be an organizer, and the tournament in a
 * status that admits the action. Loads `categories` and `competitors` for
 * validation.
 *
 * ANY organizer of the organization can administrate ANY of its tournaments —
 * not just whoever happens to have created it. Organizers are colleagues running
 * the same club, and every other management path already works that way (see
 * `setMatchResult`, `setMatchSchedule`, and the start/finish/delete/update
 * routes). The organization boundary is enforced by the model's global scope, so
 * a tournament of another organization is simply not found.
 *
 * `allowOngoing` opts into the late-registration path, which is the only
 * administrative action a running tournament accepts. It additionally loads the
 * tournament's `matches`, since where (and whether) a late entrant fits is read
 * off the structure itself.
 */
export async function loadManageableTournament(
  tournamentId: number,
  userId: number,
  { allowOngoing = false }: { allowOngoing?: boolean } = {}
): Promise<Tournament> {
  const tournament = await Tournament.where('id', Number(tournamentId))
    .with('categories', 'categories.category', 'competitors')
    .when(allowOngoing, (query) => query.with('matches'))
    .first()

  if (!tournament) {
    throw new ApiException('Torneo no encontrado', 404)
  }

  const caller = await User.find(userId)

  if (caller?.roleId !== Role.ORGANIZER) {
    throw new ApiException('No autorizado para administrar este torneo', 403)
  }

  const allowed =
    tournament.status === TournamentStatus.STAND_BY || (allowOngoing && tournament.status === TournamentStatus.ONGOING)

  if (!allowed) {
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
 * represents). Works the same for free and paid tournaments — the entry fee is
 * settled between player and organizer off-platform, so nothing about the
 * registration depends on it.
 *
 * `playerIds` follows the same convention as the player-facing join: index 0 is
 * the main player (team captain in interclubes) and the rest are their partner
 * or team mates.
 */
export async function registerCompetitor(
  tournament: Tournament,
  tournamentCategoryId: number,
  playerIds: number[],
  siteId: number | null = null,
  slotSelection: LateRegistrationSlotSelection | null = null
): Promise<Competitor> {
  const categories = tournament.categories ?? []
  const targetCategory = categories.find((category) => category.id === Number(tournamentCategoryId))

  if (!targetCategory) {
    throw new ApiException('Categoría inválida')
  }

  // Resolved BEFORE anything is written: a running tournament only accepts an
  // entrant where its structure already has room, so there is no point creating
  // a competitor we would then have nowhere to put.
  const slot =
    tournament.status === TournamentStatus.ONGOING ? resolveLateSlot(tournament, targetCategory, slotSelection) : null
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

    return attachIfLate(tournament, await createCompetitor(targetCategory.id, roster, data), slot)
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

  return attachIfLate(tournament, await createCompetitor(targetCategory.id, resolvedPlayerIds), slot)
}

/** Which structural hole the organizer picked for a late entrant, as sent by the client. */
export interface LateRegistrationSlotSelection {
  /** BYE: id of the walkover match to fill. */
  matchId?: number | null
  /** GROUP: index of the group to join. */
  groupNumber?: number | null
}

/**
 * The structural hole a late entrant will occupy, re-derived from the
 * tournament's current state rather than trusted from the request.
 *
 * When the organizer picked one it must still be there — between opening the
 * dialog and confirming, a result may have been loaded that closed it, and
 * failing loudly is far better than silently putting the entrant somewhere else.
 * When they picked nothing (a category that only ever had one option) the first
 * remaining slot is taken.
 */
function resolveLateSlot(
  tournament: Tournament,
  category: TournamentCategory,
  selection: LateRegistrationSlotSelection | null
): LateRegistrationSlot {
  const slots = getLateRegistrationSlots(tournament, category, tournament.matches ?? [], tournament.competitors ?? [])

  if (slots.length === 0) {
    throw new ApiException('El torneo ya inició y su estructura no admite nuevas inscripciones en esta categoría')
  }

  const matchId = selection?.matchId != null ? Number(selection.matchId) : null
  const groupNumber = selection?.groupNumber != null ? Number(selection.groupNumber) : null

  if (matchId == null && groupNumber == null) {
    return slots[0]
  }

  const picked = slots.find(
    (slot) => (matchId != null && slot.matchId === matchId) || (groupNumber != null && slot.groupNumber === groupNumber)
  )

  if (!picked) {
    throw new ApiException('La posición elegida ya no está disponible')
  }

  return picked
}

/** Slots a just-created competitor into the structure when the tournament is already running. */
async function attachIfLate(
  tournament: Tournament,
  competitor: Competitor,
  slot: LateRegistrationSlot | null
): Promise<Competitor> {
  if (slot) {
    await attachLateCompetitor(tournament, competitor, slot)
  }

  return competitor
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
