import { getCompetitors } from '@/app/(tournaments)/services/competitors'
import { getTournament } from '@/app/(tournaments)/services/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/tournaments/[id]/get — full tournament detail (competitors, rounds,
 * matches), plus the signed-in user competitor entry (if any).
 */
export const POST = withAuth<{ id: string }>(async (request, context, userId) => {
  const { id } = await context.params
  const tournamentId = Number(id)
  const tournament = await getTournament({
    id: tournamentId,
    withCompetitors: true,
    withRounds: true,
    withMatches: true
  })

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  const competitors = await getCompetitors({ tournamentId })
  const userEntry = competitors.find((c) => c.userId === userId || c.partnerUserId === userId) ?? null

  return {
    tournament,
    competitors: tournament.competitors ?? [],
    rounds: tournament.rounds ?? [],
    matches: tournament.matches ?? [],
    userEntry,
    isOwner: tournament.ownerId === userId
  }
})
