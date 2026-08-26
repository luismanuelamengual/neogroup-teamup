import { setMatchSchedule } from '@/app/(protected)/(tournaments)/services/matches'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/setMatchSchedule — sets where and when a match is played (venue,
 * day, start time and court). Organizer-only; the match must belong to a
 * tournament of the caller's organization and the venue to its sites catalogue.
 *
 * Written from the tournament planner on every drag & drop. Use
 * /api/clearMatchSchedule to unschedule a match.
 */
export const POST = withAuth(async (request, context, userId, organizationId) => {
  const { id, siteId, date, hour, courtNumber } = (await request.json()) as {
    id: number
    siteId: number
    date: string
    hour: string
    courtNumber: number
  }

  await setMatchSchedule(Number(id), { siteId, date, hour, courtNumber }, userId, organizationId)
})
