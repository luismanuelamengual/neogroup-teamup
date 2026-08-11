import { loadManageableTournament } from '@/app/(protected)/(tournaments)/services/administration'
import { closeGroupPhase } from '@/app/(protected)/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/closeGroupPhase — ends the group phase of one category of a running
 * "groups + playoff" tournament and starts its knockout, voiding the group
 * fixtures that are still pending.
 *
 * Organizer-only and scoped to the caller's organization, both enforced by
 * `loadManageableTournament` (with `allowOngoing`, since this is by definition
 * an action on a tournament already under way).
 *
 * Returns the number of voided fixtures.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, tournamentCategoryId } = (await request.json()) as {
    tournamentId: number
    tournamentCategoryId: number
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId, { allowOngoing: true })
  const voided = await closeGroupPhase(tournament, Number(tournamentCategoryId))

  return { voided }
})
