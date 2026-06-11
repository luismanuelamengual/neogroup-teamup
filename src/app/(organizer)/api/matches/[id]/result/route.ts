import { NextRequest, NextResponse } from 'next/server'
import { MatchScore } from '@/app/_models/types'
import { saveMatchResult } from '@/app/_services/tournament.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'

/**
 * PUT /api/matches/[id]/result — saves (or edits) a match result.
 * Allowed for the tournament owner and for players taking part in the match.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const { id } = await context.params
  const { score } = (await request.json()) as { score: MatchScore }

  return serviceResponse(await saveMatchResult(userId, Number(id), score))
}
