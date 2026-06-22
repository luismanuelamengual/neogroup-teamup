import { startTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'
import { Tournament } from '../../../models/Tournament'

/** POST /api/startTournament — sets the tournament ongoing and generates round 1. */
export const POST = withAuth(async (request) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await Tournament.find(Number(id))

  if (!tournament) {
    throw new ApiException('notFound', 404)
  }

  await startTournament(tournament)
})
