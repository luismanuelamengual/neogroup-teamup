import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'

export interface CompetitorOptions {
  tournamentId?: number
}

export async function getCompetitors({ tournamentId }: CompetitorOptions = {}): Promise<Competitor[]> {
  if (tournamentId == null) {
    return Competitor.orderBy('id').get()
  }

  // Competitors belong to a tournament through their category instance.
  const categories = await TournamentCategory.where('tournamentId', tournamentId).get()

  return Competitor.whereIn(
    'tournamentCategoryId',
    categories.map((category) => category.id)
  ).get()
}
