import { RankingEntryDto } from '@/app/(protected)/(rankings)/models/RankingEntryDto'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { executeRequest } from '@/app/actions/api'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

export interface RankingFilters {
  categoryId?: number | null
  discipline?: Discipline | null
  subDiscipline?: SubDiscipline | null
  page?: number
  pageSize?: number
}

/** Paginated ranking board for the organization (pages of 20 by default). */
export async function searchRankings({
  categoryId = null,
  discipline = null,
  subDiscipline = null,
  page = 1,
  pageSize = 20
}: RankingFilters = {}): Promise<PaginatedResponse<RankingEntryDto[]>> {
  return executeRequest<PaginatedResponse<RankingEntryDto[]>>('/getRankings', {
    categoryId,
    discipline,
    subDiscipline,
    page,
    pageSize
  })
}
