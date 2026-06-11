import { NextRequest, NextResponse } from 'next/server'
import { finishTournament } from '@/app/_services/tournament.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'

/** POST /api/tournaments/[id]/finish — marks the tournament as finished. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const { id } = await context.params

  return serviceResponse(await finishTournament(userId, Number(id)))
}
