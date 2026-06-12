import { NextResponse } from 'next/server'
import { UpdateTournamentInput } from '@/app/(tournaments)/models/inputs'
import { getTournamentDetail, getUserCompetitorEntry } from '@/app/(tournaments)/services/queries'
import { requireOwnedTournament } from '@/app/(tournaments)/services/tournament-helpers'
import { apiResponse, withAuth } from '@/app/utils/api-server'

/**
 * GET /api/tournaments/[id] — full tournament detail (competitors, rounds, matches),
 * plus the signed-in user competitor entry (if any).
 */
export const GET = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournamentId = Number(id)
  const detail = await getTournamentDetail(tournamentId)

  if (!detail) {
    return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 })
  }

  const userEntry = await getUserCompetitorEntry(tournamentId, userId)

  return NextResponse.json({ ...detail, userEntry, isOwner: detail.tournament.ownerId === userId })
})

/** PATCH /api/tournaments/[id] — updates the editable attributes (owner only). */
export const PATCH = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const input = (await request.json()) as UpdateTournamentInput
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    return apiResponse({ success: false, error: 'notFound' })
  }

  const name = input.name.trim()

  if (!name || !input.startDate || input.maxCompetitors < 2) {
    return apiResponse({ success: false, error: 'missingFields' })
  }

  tournament.name = name
  tournament.description = input.description.trim() || null
  tournament.location = input.location.trim() || null
  tournament.startDate = input.startDate
  tournament.maxCompetitors = input.maxCompetitors
  tournament.updatedAt = new Date()
  await tournament.save()

  return apiResponse({ success: true })
})
