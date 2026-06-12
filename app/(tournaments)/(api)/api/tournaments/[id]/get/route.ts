import { getTournamentDetail, getUserCompetitorEntry } from '@/app/(tournaments)/services/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/tournaments/[id]/get — full tournament detail (competitors, rounds,
 * matches), plus the signed-in user competitor entry (if any).
 */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournamentId = Number(id)
  const detail = await getTournamentDetail(tournamentId)

  if (!detail) {
    throw new ApiException('notFound', 404)
  }

  const userEntry = await getUserCompetitorEntry(tournamentId, userId)

  return { ...detail, userEntry, isOwner: detail.tournament.ownerId === userId }
})
