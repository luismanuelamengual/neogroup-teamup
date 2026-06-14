import { Repository } from '@neogroup/neorm'
import { Competitor } from '@/app/(tournaments)/models/Competitor'

export interface CompetitorOptions {
  tournamentId?: number
}

const DEFAULT_COMPETITOR_OPTIONS: CompetitorOptions = {}

export async function getCompetitors(options: CompetitorOptions = DEFAULT_COMPETITOR_OPTIONS): Promise<Competitor[]> {
  return Repository.get(Competitor)
    .when(options.tournamentId, (query) => query.where('tournamentId', options.tournamentId))
    .get()
}
