import { Competitor } from '@/app/(tournaments)/entities/Competitor'
import { Tournament } from '@/app/(tournaments)/entities/Tournament'
import { ApiException, withAuth } from '@/app/utils/api-server'

/** POST /api/registrations/leave — removes the signed-in user registration (stand_by only). */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId } = (await request.json()) as { tournamentId: number }
  const tournament: Tournament | null = await Tournament.find(Number(tournamentId))

  if (!tournament) {
    throw new ApiException('notFound')
  }

  if (tournament.status !== 'stand_by') {
    throw new ApiException('registrationClosed')
  }

  const entry: Competitor | null = await Competitor.where('tournamentId', tournament.id).where('userId', userId).first()

  if (!entry) {
    throw new ApiException('notRegistered')
  }

  await entry.delete()
})
