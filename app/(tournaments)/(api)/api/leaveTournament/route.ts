import { Competitor } from '@/app/(tournaments)/models/Competitor'
import { Tournament } from '@/app/(tournaments)/models/Tournament'
import { TournamentStatus } from '@/app/(tournaments)/models/TournamentStatus'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/leaveTournament — removes the signed-in user registration (stand_by only). */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId } = (await request.json()) as { tournamentId: number }
  const tournament = await Tournament.find(Number(tournamentId))

  if (!tournament) {
    throw new ApiException('notFound')
  }

  if (tournament.status !== TournamentStatus.STAND_BY) {
    throw new ApiException('registrationClosed')
  }

  const entry = await Competitor.where('tournamentId', tournament.id)
    .where('userId', userId)
    .first()

  if (!entry) {
    throw new ApiException('notRegistered')
  }

  await entry.delete()
})
