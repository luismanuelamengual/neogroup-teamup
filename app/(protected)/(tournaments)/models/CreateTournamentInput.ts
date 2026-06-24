import { TournamentDto } from './TournamentDto'

export type CreateTournamentInput = Partial<TournamentDto> & { categoryNames?: string[]; maxCompetitors?: number }
