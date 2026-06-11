import { apiResponse, withAuth } from '@/app/_utils/api-server'
import { requireOwnedTournament } from '@/app/(organizer)/api/tournaments/[id]/helpers'

/** POST /api/tournaments/[id]/finish — marks the tournament as finished. */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournament = await requireOwnedTournament(Number(id), userId)

  if (!tournament || tournament.status !== 'ongoing') {
    return apiResponse({ success: false, error: 'invalidStatus' })
  }

  tournament.status = 'finished'
  tournament.updatedAt = new Date()
  await tournament.save()

  return apiResponse({ success: true })
})
