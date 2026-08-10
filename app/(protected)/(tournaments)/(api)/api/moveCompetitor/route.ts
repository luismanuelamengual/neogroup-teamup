import { loadManageableTournament, moveCompetitor } from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/moveCompetitor — moves a competitor to another category of the same
 * tournament (any organizer of the organization, not just the creator).
 *
 * Works on a running tournament too, but only when the competitor can leave
 * their category without leaving a trace AND the destination has a structural
 * hole for them — see utils/lateRemoval and utils/lateRegistration.
 * `slotMatchId` / `slotGroupNumber` carry which hole the organizer picked in the
 * destination; both are optional, and the server re-validates the choice against
 * current state either way.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, competitorId, tournamentCategoryId, slotMatchId, slotGroupNumber } = (await request.json()) as {
    tournamentId: number
    competitorId: number
    tournamentCategoryId: number
    /** Move into a knockout bye of the destination: the walkover match to fill. */
    slotMatchId?: number | null
    /** Move into a running group phase of the destination: the group to join. */
    slotGroupNumber?: number | null
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId, { allowOngoing: true })

  await moveCompetitor(tournament, Number(competitorId), Number(tournamentCategoryId), {
    matchId: slotMatchId ?? null,
    groupNumber: slotGroupNumber ?? null
  })
})
