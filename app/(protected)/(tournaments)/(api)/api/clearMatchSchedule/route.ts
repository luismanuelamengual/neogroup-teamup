import { clearMatchSchedule } from '@/app/(protected)/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/clearMatchSchedule — removes a match from the planning, clearing
 * its venue, day, start time and court. Organizer-only, same guards as
 * /api/setMatchSchedule.
 */
export const POST = withAuth(async (request, context, userId, organizationId) => {
  const { id } = (await request.json()) as { id: number }

  await clearMatchSchedule(Number(id), userId, organizationId)
})
