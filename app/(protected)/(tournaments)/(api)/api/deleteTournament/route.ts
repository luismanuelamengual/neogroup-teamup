import { deleteTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { withAuth } from '@/app/utils/api-server'
import { Tournament } from '../../../models/Tournament'

/** POST /api/finishTournament — marks the tournament as finished and awards ranking points. */
export const POST = withAuth(async (request) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await Tournament.find(Number(id))

  if (tournament) {
    return await deleteTournament(tournament)
  } else {
    return false
  }
})
