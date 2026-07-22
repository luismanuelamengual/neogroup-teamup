import { TournamentDto } from './TournamentDto'

/**
 * `image` is overridden to the raw base64 data URL the client uploads, null
 * to remove the tournament's picture — unlike `TournamentDto.image`, which is
 * the nested `TournamentImageDto` returned when reading a tournament back.
 */
export type UpdateTournamentInput = Omit<Partial<TournamentDto>, 'image'> & {
  image?: string | null
}
