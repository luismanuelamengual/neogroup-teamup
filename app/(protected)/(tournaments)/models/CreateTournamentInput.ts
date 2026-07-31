import { TournamentDto } from './TournamentDto'

/**
 * `categoryIds` are picked from the organization catalogue (the /categories
 * ABM): the tournament form no longer creates categories on the fly.
 *
 * `paid` is deliberately not part of the input: it is the settlement flag of
 * TeamUp's service fee, owned by the payments module, and a client must never
 * be able to mark a tournament as paid. Whether the tournament has a cost is
 * expressed by `entryFee` alone.
 */
export type CreateTournamentInput = Omit<Partial<TournamentDto>, 'image' | 'paid'> & {
  categoryIds?: number[]
  maxCompetitors?: number
  image?: string | null
}
