import { NextRequest, NextResponse } from 'next/server'
import { createTournament, CreateTournamentInput } from '@/app/_services/tournament.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'
import { getOrganizerTournaments } from '@/app/_utils/queries'

/** GET /api/tournaments?name=&active=1 — tournaments owned by the signed-in user. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const params = request.nextUrl.searchParams
  const tournaments = await getOrganizerTournaments(userId, {
    name: params.get('name') ?? undefined,
    onlyActive: params.get('active') === '1'
  })

  return NextResponse.json({ tournaments })
}

/** POST /api/tournaments — creates a new tournament in stand_by status. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const input = (await request.json()) as CreateTournamentInput

  return serviceResponse(await createTournament(userId, input))
}
