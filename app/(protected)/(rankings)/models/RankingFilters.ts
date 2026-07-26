import { Discipline } from '../../(tournaments)/models/Discipline'

export interface RankingFilters {
  categoryId?: number | null
  discipline?: Discipline | null
  page?: number
  pageSize?: number
}
