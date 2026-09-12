import { Discipline } from '@/app/(protected)/(disciplines)/models/Discipline'

export interface RankingFilters {
  categoryId?: number | null
  discipline?: Discipline | null
  page?: number
  pageSize?: number
}
