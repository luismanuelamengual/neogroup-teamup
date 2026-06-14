import { Repository } from '@neogroup/neorm'
import { Competitor } from '@/app/(tournaments)/models/Competitor'

export interface CompetitorOptions {
  tournamentId?: number
}

export async function getCompetitors({ tournamentId }: CompetitorOptions = {}): Promise<Competitor[]> {
  return Repository.get(Competitor)
    .when(tournamentId, (query) => query.where('tournamentId', tournamentId))
    .get()
}
