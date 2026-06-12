import { Competitor } from '@/app/(tournaments)/entities/Competitor'
import { Tournament } from '@/app/(tournaments)/entities/Tournament'
import { apiResponse, withAuth } from '@/app/utils/api-server'

/** DELETE /api/registrations/[tournamentId] — removes the signed-in user registration (stand_by only). */
export const DELETE = withAuth<{ tournamentId: string }>(async (request, context, userId) => {
  const { tournamentId } = await context.params
  const tournament: Tournament | null = await Tournament.find(Number(tournamentId))

  if (!tournament) {
    return apiResponse({ success: false, error: 'notFound' })
  }

  if (tournament.status !== 'stand_by') {
    return apiResponse({ success: false, error: 'registrationClosed' })
  }

  const entry: Competitor | null = await Competitor.where('tournamentId', tournament.id).where('userId', userId).first()

  if (!entry) {
    return apiResponse({ success: false, error: 'notRegistered' })
  }

  await entry.delete()

  return apiResponse({ success: true })
})
