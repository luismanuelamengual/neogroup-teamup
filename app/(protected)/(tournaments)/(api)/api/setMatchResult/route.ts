import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { setMatchResult } from '@/app/(protected)/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/setMatchResult — saves (or edits) a match result.
 * Allowed for the tournament owner and for players taking part in the match,
 * while the match round is open.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { id, score } = (await request.json()) as { id: number; score: MatchScore }

  await setMatchResult(Number(id), score, userId)
})
