import { MatchScore } from '@/app/(protected)/(tournaments)/models/MatchScore'
import { setMatchResult } from '@/app/(protected)/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/setMatchResult — saves (or edits) a match result.
 * Always allowed for any organizer of the organization (not just the
 * tournament's owner); players taking part in the match may also submit the
 * result when the tournament has `allowPlayerSetScore` enabled. The match
 * round must also be open.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { id, score } = (await request.json()) as { id: number; score: MatchScore }

  await setMatchResult(Number(id), score, userId)
})
