import { NextResponse } from 'next/server'
import { CreateTournamentInput } from '@/app/_models/api'
import { Tournament } from '@/app/_models/Tournament'
import { DEFAULT_AMERICANO_SETTINGS, DEFAULT_LEAGUE_SETTINGS, TournamentSettings } from '@/app/_models/types'
import { apiResponse, withAuth } from '@/app/_utils/api-server'
import { getOrganizerTournaments } from '@/app/_utils/queries'

/** GET /api/tournaments?name=&active=1 — tournaments owned by the signed-in user. */
export const GET = withAuth(async (request, context, userId) => {
  const params = request.nextUrl.searchParams
  const tournaments = await getOrganizerTournaments(userId, {
    name: params.get('name') ?? undefined,
    onlyActive: params.get('active') === '1'
  })

  return NextResponse.json({ tournaments })
})

/** POST /api/tournaments — creates a new tournament in stand_by status. */
export const POST = withAuth(async (request, context, userId) => {
  const input = (await request.json()) as CreateTournamentInput
  const name = input.name.trim()

  if (!name) {
    return apiResponse({ success: false, error: 'missingFields' })
  }

  if (!input.startDate || !input.maxCompetitors || input.maxCompetitors < 2) {
    return apiResponse({ success: false, error: 'missingFields' })
  }

  if (input.type === 'americano' && input.discipline !== 'padel') {
    return apiResponse({ success: false, error: 'americanoOnlyPadel' })
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

  return apiResponse({ success: true, id: tournament.id })
})
