import { getPlayers } from '@/app/(protected)/(tournaments)/services/players'
import { getTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/getPlayersForJoin — searches players (roleId = PLAYER) eligible to be
 * registered as a competitor in a tournament, i.e. anyone not already registered in it.
 * Used both by the organizer's "Inscribir competidor" admin form and by a player's own
 * partner picker when joining a tournament — neither needs to own the tournament, just to
 * belong to its organization, which `getTournament` already enforces via Tournament's own
 * organization scope.
 *
 * The exclusion is resolved here, from the tournament's own competitors, instead of a
 * client-supplied id list: `getPlayers` is paginated, so a client-side filter applied after
 * the fact would eventually starve the picker once every player on the current page has
 * been registered (the next page keeps returning the same, now fully excluded, top-10-by-name
 * instead of the next real candidates).
 *
 * `excludeIds` is still accepted for purely local/UI exclusions that aren't part of the
 * tournament's registration state, e.g. hiding the main entrant while picking their pair
 * partner in the same form submission.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, query, excludeIds } = (await request.json()) as {
    tournamentId: number
    query?: string
    excludeIds?: number[]
  }
  const tournament = await getTournament({ id: Number(tournamentId), withCompetitors: true })

  if (!tournament) {
    throw new ApiException('Torneo no encontrado', 404)
  }

  const registeredPlayerIds = (tournament.competitors ?? []).flatMap((competitor) => competitor.playerIds)
  const { data } = await getPlayers({
    query,
    excludeIds: [...new Set([userId, ...registeredPlayerIds, ...(excludeIds ?? [])])]
  })

  return data
})
