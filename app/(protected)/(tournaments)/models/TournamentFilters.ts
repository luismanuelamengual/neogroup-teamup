import { TournamentStatus } from './TournamentStatus'

export interface TournamentFilters {
  name?: string
  statuses?: TournamentStatus[]
  ownedByPlayer?: boolean
  page?: number
  pageSize?: number
}
