import { Tournament } from '@/app/(tournaments)/entities/Tournament'
import { CreateTournamentInput } from '@/app/(tournaments)/models/inputs'
import {
  DEFAULT_AMERICANO_SETTINGS,
  DEFAULT_LEAGUE_SETTINGS,
  TournamentSettings
} from '@/app/(tournaments)/models/types'
import { ApiException, withAuth } from '@/app/utils/api-server'

/** POST /api/tournaments/create — creates a new tournament in stand_by status. */
export const POST = withAuth(async (request, context, userId) => {
  const input = (await request.json()) as CreateTournamentInput
  const name = input.name.trim()

  if (!name) {
    throw new ApiException('missingFields')
  }

  if (!input.startDate || !input.maxCompetitors || input.maxCompetitors < 2) {
    throw new ApiException('missingFields')
  }

  if (input.type === 'americano' && input.discipline !== 'padel') {
    throw new ApiException('americanoOnlyPadel')
  }

  let settings: TournamentSettings = {}

  if (input.type === 'league') {
    settings = { ...DEFAULT_LEAGUE_SETTINGS, ...input.settings }
  } else if (input.type === 'americano') {
    settings = { ...DEFAULT_AMERICANO_SETTINGS, ...input.settings }
  }

  const tournament = new Tournament()

  tournament.ownerId = userId
  tournament.name = name
  tournament.description = input.description.trim() || null
  tournament.status = 'stand_by'
  tournament.discipline = input.discipline
  tournament.type = input.type
  tournament.scoreFormat = input.scoreFormat
  tournament.startDate = input.startDate
  tournament.location = input.location.trim() || null
  tournament.maxCompetitors = input.maxCompetitors
  tournament.settings = settings
  tournament.currentRound = 0
  tournament.createdAt = new Date()
  tournament.updatedAt = new Date()
  await tournament.save()

  return { id: tournament.id }
})
