import {
  addTournamentCategory,
  loadManageableTournament
} from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/addTournamentCategory — adds a category to a tournament (owner, stand_by only). */
export const POST = withAuth(async (request, context, userId, organizationId) => {
  const { tournamentId, name, maxCompetitors } = (await request.json()) as {
    tournamentId: number
    name: string
    maxCompetitors: number
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId)

  await addTournamentCategory(tournament, organizationId, name ?? '', Number(maxCompetitors))
})
