import { apiResponse, withAuth } from '@/app/_utils/api-server'
import { createRound, requireOwnedTournament } from '@/app/(organizer)/api/tournaments/[id]/helpers'

/** POST /api/tournaments/[id]/start — sets the tournament ongoing and generates round 1. */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament) {
    return apiResponse({ success: false, error: 'notFound' })
  }

  if (tournament.status !== 'stand_by') {
    return apiResponse({ success: false, error: 'invalidStatus' })
  }

  tournament.status = 'ongoing'
  const result = await createRound(tournament, 1)

  if (!result.success) {
    return apiResponse(result)
  }

  await tournament.save()

  return apiResponse({ success: true })
})
