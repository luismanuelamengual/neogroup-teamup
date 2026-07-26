import { Site } from '@/app/(protected)/(sites)/models/Site'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { CompetitorData } from '@/app/(protected)/(tournaments)/models/CompetitorData'
import { JoinTournamentInput } from '@/app/(protected)/(tournaments)/models/JoinTournamentInput'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { registersAsPairs, registersAsTeam } from '@/app/(protected)/(tournaments)/utils/discipline'
import {
  buildSiteLabels,
  INTERCLUBS_MIN_TEAM_PLAYERS,
  LabelableTeam
} from '@/app/(protected)/(tournaments)/utils/interclubs'
import { ApiException } from '@/app/models/ApiException'
import { User } from '@/app/models/User'

export interface ResolvedRegistration {
  targetCategory: TournamentCategory
  /** Validated player roster for the competitor (index 0 is the main player). */
  playerIds: number[]
  /** Type-specific attributes of the competitor (interclubes: `{ siteId }`). */
  data: CompetitorData | null
}

/**
 * Validates a join request against the current tournament state and resolves the
 * target category instance and roster. Throws an ApiException for any rule
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

  const user = await User.find(userId)

  if (!user) {
    throw new ApiException('Usuario no encontrado')
  }

  // The signed-in user always heads the roster: main player in singles/pairs,
  // captain in interclubes (a captain is a player like any other for now).
  const requestedIds = (input.playerIds ?? [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0 && id !== user.id)
  const mates = [...new Set(requestedIds)]

  if (registersAsTeam(tournament.type)) {
    const playerIds = await resolveTeamRoster(user.id, mates, competitors)
    const data = await resolveTeamData(tournament.organizationId, input.siteId)

    return { targetCategory, playerIds, data }
  }

  const playerIds: number[] = [user.id]

  if (registersAsPairs(tournament.discipline, tournament.subDiscipline, tournament.type)) {
    const [partnerId] = mates

    if (!partnerId) {
      throw new ApiException('El usuario compañero es requerido')
    }

    const partner = await User.find(partnerId)

    if (!partner) {
      throw new ApiException('Usuario compañero no encontrado')
    }

    if (competitors.some((competitor) => competitor.playerIds.includes(partner.id))) {
      throw new ApiException('Usuario compañero ya inscripto en el torneo')
    }

    playerIds.push(partner.id)
  }

  return { targetCategory, playerIds, data: null }
}

/**
 * Validates the roster of an interclubes team: the captain plus their team
 * mates, at least `INTERCLUBS_MIN_TEAM_PLAYERS` in total, all of them real
 * users and none of them already playing for another team of the tournament.
 */
export async function resolveTeamRoster(
  captainId: number,
  mateIds: number[],
  competitors: Competitor[]
): Promise<number[]> {
  const playerIds = [captainId, ...mateIds.filter((id) => id !== captainId)]

  if (playerIds.length < INTERCLUBS_MIN_TEAM_PLAYERS) {
    throw new ApiException(`El equipo debe tener al menos ${INTERCLUBS_MIN_TEAM_PLAYERS} jugadores`)
  }

  const players = await User.whereIn('id', playerIds).get()

  if (players.length !== playerIds.length) {
    throw new ApiException('Alguno de los jugadores seleccionados no existe')
  }

  for (const competitor of competitors) {
    const duplicate = playerIds.find((id) => competitor.playerIds.includes(id))

    if (duplicate != null) {
      const player = players.find((entry) => entry.id === duplicate)

      throw new ApiException(`El jugador ${player?.email ?? duplicate} ya está inscripto en el torneo`)
    }
  }

  return playerIds
}

/** Validates the venue an interclubes team represents and wraps it as competitor data. */
export async function resolveTeamData(organizationId: number, siteId: unknown): Promise<CompetitorData> {
  const id = Number(siteId)

  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiException('La sede del equipo es requerida')
  }

  const site = await Site.where('organizationId', organizationId).where('id', id).first()

  if (!site) {
    throw new ApiException('La sede seleccionada no es válida')
  }

  return { siteId: site.id }
}

/** Creates and persists a competitor for a resolved registration. */
export async function createCompetitor(
  tournamentCategoryId: number,
  playerIds: number[],
  data: CompetitorData | null = null
): Promise<Competitor> {
  const competitor = new Competitor()

  competitor.tournamentCategoryId = tournamentCategoryId
  competitor.playerIds = playerIds
  competitor.data = data
  competitor.label = null
  competitor.createdAt = new Date()
  await competitor.save()

  // A team's label depends on the other teams of the category, so it can only
  // be decided once this one is in.
  await assignSiteLabels(tournamentCategoryId)

  return competitor
}

/**
 * Recomputes the `label` of every team of a tournament category from the venues
 * they represent: the venue name on its own, or with a letter ("Alemán A",
 * "Alemán B") when that venue has more than one team in the category.
 *
 * It is a whole-category recomputation, not a per-team one, because the labels
 * are relative to each other: registering a second team of a venue must rename
 * the first one from "Alemán" to "Alemán A", and unregistering it must turn the
 * survivor back into plain "Alemán". Call it after every change to the
 * competitors of a category (register, unregister, move).
 *
 * A no-op for tournaments whose competitors have no venue (every type other
 * than interclubes), so callers do not need to check the type first.
 */
export async function assignSiteLabels(tournamentCategoryId: number): Promise<void> {
  const competitors = await Competitor.where('tournamentCategoryId', tournamentCategoryId).orderBy('id').get()
  const siteIds = [
    ...new Set(competitors.map((competitor) => competitor.data?.siteId).filter((id): id is number => id != null))
  ]

  if (siteIds.length === 0) {
    return
  }

  const sites = await Site.whereIn('id', siteIds).get()
  const siteNameById = new Map(sites.map((site) => [site.id, site.name]))
  const teams: LabelableTeam[] = competitors.map((competitor) => ({
    id: competitor.id,
    siteId: competitor.data?.siteId ?? null,
    siteName: competitor.data?.siteId != null ? (siteNameById.get(competitor.data.siteId) ?? null) : null
  }))
  const labels = buildSiteLabels(teams)

  for (const competitor of competitors) {
    const label = labels.get(competitor.id) ?? null

    if (competitor.label === label) {
      continue
    }

    competitor.label = label
    await competitor.save()
  }
}
