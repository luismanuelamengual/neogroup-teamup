import { Repository } from '@neogroup/neorm'
import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(tournaments)/models/AmericanoSettings'
import { Discipline } from '@/app/(tournaments)/models/Discipline'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(tournaments)/models/LeagueSettings'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { TournamentSettings } from '@/app/(tournaments)/models/TournamentSettings'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { TournamentType } from '@/app/(tournaments)/models/TournamentType'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/createTournament — creates a new tournament in stand_by status. */
export const POST = withAuth(async (request, context, userId) => {
  const input = (await request.json()) as Partial<Tournament>
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

  if (input.type === TournamentType.AMERICANO && input.discipline !== Discipline.PADEL) {
    throw new ApiException('americanoOnlyPadel')
  }

  let settings: TournamentSettings = {}

  if (input.type === TournamentType.LEAGUE) {
    settings = { ...DEFAULT_LEAGUE_SETTINGS, ...input.settings }
  } else if (input.type === TournamentType.AMERICANO) {
    settings = { ...DEFAULT_AMERICANO_SETTINGS, ...input.settings }
  }

  const tournament = new Tournament()

  tournament.ownerId = userId
  tournament.name = name
  tournament.description = input.description?.trim() || null
  tournament.status = TournamentStatus.STAND_BY
  tournament.discipline = input.discipline
  tournament.subDiscipline = input.discipline === Discipline.TENNIS ? input.subDiscipline ?? null : null
  tournament.type = input.type
  tournament.scoreFormat = input.scoreFormat
  tournament.startDate = new Date(input.startDate as any)
  tournament.location = input.location?.trim() || null
  tournament.maxCompetitors = input.maxCompetitors
  tournament.settings = settings
  tournament.currentRound = 0
  tournament.createdAt = new Date()
  tournament.updatedAt = new Date()
  await Repository.get(Tournament).save(tournament)

  return { id: tournament.id }
})
