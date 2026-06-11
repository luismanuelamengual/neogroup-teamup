import { NextRequest, NextResponse } from 'next/server'
import { updateTournament, UpdateTournamentInput } from '@/app/_services/tournament.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'
import { getTournamentDetail, getUserCompetitorEntry } from '@/app/_utils/queries'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/tournaments/[id] — full tournament detail (competitors, rounds, matches),
 * plus the signed-in user competitor entry (if any).
 */
export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const { id } = await context.params
  const tournamentId = Number(id)
  const detail = await getTournamentDetail(tournamentId)

  if (!detail) {
    return NextResponse.json({ success: false, error: 'notFound' }, { status: 404 })
  }

  const userEntry = await getUserCompetitorEntry(tournamentId, userId)

  return NextResponse.json({ ...detail, userEntry, isOwner: detail.tournament.ownerId === userId })
}

/** PATCH /api/tournaments/[id] — updates the editable attributes (owner only). */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const { id } = await context.params
  const input = (await request.json()) as UpdateTournamentInput

  return serviceResponse(await updateTournament(userId, Number(id), input))
}
