import { NextRequest, NextResponse } from 'next/server'
import { startNextRound } from '@/app/_services/tournament.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'

/** POST /api/tournaments/[id]/rounds/next — starts the next round. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const { id } = await context.params

  return serviceResponse(await startNextRound(userId, Number(id)))
}
