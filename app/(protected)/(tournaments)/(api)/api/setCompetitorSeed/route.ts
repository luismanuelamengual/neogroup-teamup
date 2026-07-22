import { loadManageableTournament, setCompetitorSeed } from '@/app/(protected)/(tournaments)/services/administration'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/setCompetitorSeed — sets or clears a competitor's manual seed (owner, stand_by only). */
export const POST = withAuth(async (request, context, userId) => {
  const { tournamentId, competitorId, seedNumber } = (await request.json()) as {
    tournamentId: number
    competitorId: number
    seedNumber: number | null
  }
  const tournament = await loadManageableTournament(Number(tournamentId), userId)

  await setCompetitorSeed(tournament, Number(competitorId), seedNumber == null ? null : Number(seedNumber))
})
