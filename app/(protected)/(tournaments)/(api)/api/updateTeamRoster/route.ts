import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { updateTeamRoster } from '@/app/(protected)/(tournaments)/services/registrations'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/updateTeamRoster — adds/removes team mates from the signed-in
 * user's own interclubes team (they must be its captain, i.e. `playerIds[0]`).
 * Only allowed while the tournament is still in STAND_BY, same as join/leave.
 */
export const POST = withAuth(async (request, context, userId): Promise<void> => {
  const { tournamentId, playerIds } = (await request.json()) as { tournamentId: number; playerIds?: number[] }
  const tournament = await Tournament.where('id', Number(tournamentId)).with('competitors').first()

  if (!tournament) {
    throw new ApiException('Torneo no encontrado')
  }

  await updateTeamRoster(tournament, userId, playerIds ?? [])
})
