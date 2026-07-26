import { TournamentDto } from './TournamentDto'

/**
 * `categoryIds` are picked from the organization catalogue (the /categories
 * ABM): the tournament form no longer creates categories on the fly.
 */
export type CreateTournamentInput = Omit<Partial<TournamentDto>, 'image'> & {
  categoryIds?: number[]
  maxCompetitors?: number
  image?: string | null
}
