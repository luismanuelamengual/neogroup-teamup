import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { finishTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'
import { Tournament } from '../../../models/Tournament'

/** POST /api/finishTournament — marks the tournament as finished and awards ranking points. */
export const POST = withAuth(async (request) => {
  const { id } = (await request.json()) as { id: number }
  const tournament = await Tournament.find(Number(id))

  if (!tournament || tournament.status !== TournamentStatus.ONGOING) {
    throw new ApiException('invalidStatus')
  }

  await finishTournament(tournament)
})
