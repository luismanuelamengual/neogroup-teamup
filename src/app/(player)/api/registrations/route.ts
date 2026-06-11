import { NextRequest, NextResponse } from 'next/server'
import { joinTournament, JoinTournamentInput } from '@/app/_services/registration.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'

/** POST /api/registrations — registers the signed-in user into a tournament. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const { tournamentId, ...input } = (await request.json()) as JoinTournamentInput & { tournamentId: number }

  return serviceResponse(await joinTournament(userId, Number(tournamentId), input))
}
