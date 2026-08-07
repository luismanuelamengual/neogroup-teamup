import { loadManageableTournament, registerCompetitor } from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/registerCompetitor — registers a competitor into a category on
 * behalf of the organizer (any organizer of the organization, not just the creator).
 *
 * Unlike every other administrative action this one also works on a tournament
 * that has already started, but only into a structural hole that accepts an
 * entrant without altering anything already in play — see utils/lateRegistration.
 * `slotMatchId` / `slotGroupNumber` carry which hole the organizer picked; both
 * are optional, and the server re-validates the choice against current state
 * either way.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, tournamentCategoryId, playerIds, siteId, slotMatchId, slotGroupNumber } =
    (await request.json()) as {
      tournamentId: number
      tournamentCategoryId: number
      playerIds: number[]
      /** Venue of the team (interclubes only). */
      siteId?: number | null
      /** Late registration into a knockout bye: the walkover match to fill. */
      slotMatchId?: number | null
      /** Late registration into a running group phase: the group to join. */
      slotGroupNumber?: number | null
    }
  const tournament = await loadManageableTournament(Number(tournamentId), userId, { allowOngoing: true })

  await registerCompetitor(
    tournament,
    Number(tournamentCategoryId),
    (playerIds ?? []).map((id) => Number(id)),
    siteId != null ? Number(siteId) : null,
    { matchId: slotMatchId ?? null, groupNumber: slotGroupNumber ?? null }
  )
})
