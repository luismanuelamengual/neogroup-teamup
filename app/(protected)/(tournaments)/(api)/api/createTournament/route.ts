import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { DEFAULT_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/PlayoffSettings'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { normalizeCategories, normalizeStartTime } from '@/app/(protected)/(tournaments)/utils/tournament'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/createTournament — creates a new tournament in stand_by status. */
export const POST = withAuth(async (request, context, userId, organizationId) => {
  const input = (await request.json()) as Partial<TournamentDto>
  const name = input.name?.trim() ?? ''

  if (!name || !input.discipline || !input.type || !input.scoreFormat) {
    throw new ApiException('missingFields')
  }

  if (!input.startDate || !input.maxCompetitors || input.maxCompetitors < 2) {
    throw new ApiException('missingFields')
  }

  if (input.discipline === Discipline.TENNIS && !input.subDiscipline) {
    throw new ApiException('missingFields')
  }

  if (
    (input.type === TournamentType.AMERICANO || input.type === TournamentType.AMERICANO_WITH_SWAP) &&
    input.discipline !== Discipline.PADEL
  ) {
    throw new ApiException('americanoOnlyPadel')
  }

  const startTime = normalizeStartTime(input.startTime)

  if (startTime === false) {
    throw new ApiException('invalidTime')
  }

  const categories = normalizeCategories(input.categories)
  let settings: TournamentSettings = {}

  if (input.type === TournamentType.LEAGUE) {
    settings = { ...DEFAULT_LEAGUE_SETTINGS, ...input.settings }
  } else if (input.type === TournamentType.AMERICANO || input.type === TournamentType.AMERICANO_WITH_SWAP) {
    settings = { ...DEFAULT_AMERICANO_SETTINGS, ...input.settings }
  } else if (input.type === TournamentType.PLAYOFF || input.type === TournamentType.PLAYOFF_WITH_CONSOLATION) {
    settings = { ...DEFAULT_PLAYOFF_SETTINGS }
  } else if (input.type === TournamentType.GROUPS_PLAYOFF) {
    const competitorsPerGroup = Math.floor(
      input.settings?.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
    )
    const qualifiersPerGroup = Math.floor(
      input.settings?.qualifiersPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.qualifiersPerGroup
    )

    if (competitorsPerGroup < 2 || qualifiersPerGroup < 1 || qualifiersPerGroup >= competitorsPerGroup) {
      throw new ApiException('invalidGroupsSettings')
    }

    settings = { competitorsPerGroup, qualifiersPerGroup }
  }

  const tournament = new Tournament()

  tournament.organizationId = organizationId
  tournament.ownerId = userId
  tournament.name = name
  tournament.description = input.description?.trim() || null
  tournament.status = TournamentStatus.STAND_BY
  tournament.discipline = input.discipline
  tournament.subDiscipline = input.discipline === Discipline.TENNIS ? input.subDiscipline ?? null : null
  tournament.type = input.type
  tournament.scoreFormat = input.scoreFormat
  tournament.startDate = input.startDate
  tournament.startTime = startTime
  tournament.location = input.location?.trim() || null
  tournament.categories = categories
  tournament.maxCompetitors = input.maxCompetitors
  tournament.settings = settings
  tournament.currentRound = 0
  tournament.createdAt = new Date()
  tournament.updatedAt = new Date()
  await tournament.save()

  return { id: tournament.id }
})
