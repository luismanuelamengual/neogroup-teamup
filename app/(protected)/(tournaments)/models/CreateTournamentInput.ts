import { TournamentDto } from './TournamentDto'

export type CreateTournamentInput = Omit<Partial<TournamentDto>, 'image'> & {
  categoryNames?: string[]
  maxCompetitors?: number
  image?: string | null
}
