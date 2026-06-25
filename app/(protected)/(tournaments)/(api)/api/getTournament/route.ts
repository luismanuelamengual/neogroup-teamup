import { getTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/getTournament — full tournament detail (competitors, rounds, matches).
 */
export const POST = withAuth(async (request) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await getTournament({
    id: Number(id),
    withCompetitors: true,
    withRounds: true,
    withMatches: true
  })

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  return tournament
})
