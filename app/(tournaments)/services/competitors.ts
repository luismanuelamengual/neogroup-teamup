import { Competitor } from '@/app/(tournaments)/models/Competitor'

export interface CompetitorOptions {
  tournamentId?: number
}

export async function getCompetitors({ tournamentId }: CompetitorOptions = {}): Promise<Competitor[]> {
  return Competitor.when(tournamentId, (query) => query.where('tournamentId', tournamentId)).get()
}
