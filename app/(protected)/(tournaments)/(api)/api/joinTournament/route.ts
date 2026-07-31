import { JoinTournamentInput } from '@/app/(protected)/(tournaments)/models/JoinTournamentInput'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { createCompetitor, resolveRegistration } from '@/app/(protected)/(tournaments)/services/registrations'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/joinTournament — registers the signed-in user into a tournament.
 *
 * Registration is always immediate and free of charge inside the platform, even
 * when the tournament has an `entryFee`: that fee is settled between player and
 * organizer off-platform (cash at the venue, transfer, …). What TeamUp charges
 * is the service fee over the tournaments that took place, billed to the
 * organization from the "Pagos" page.
 */
export const POST = withAuth(async (request, context, userId): Promise<void> => {
  const { tournamentId, ...input } = (await request.json()) as JoinTournamentInput & { tournamentId: number }
  const tournament = await Tournament.where('id', Number(tournamentId)).with('categories', 'competitors').first()

  if (!tournament) {
    throw new ApiException('Torneo no encontrado')
  }

  const { targetCategory, playerIds, data } = await resolveRegistration(tournament, userId, input)

  await createCompetitor(targetCategory.id, playerIds, data)
})
