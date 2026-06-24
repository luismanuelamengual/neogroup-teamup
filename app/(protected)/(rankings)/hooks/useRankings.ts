'use client'

import { useCallback } from 'react'
import { RankingEntryDto } from '@/app/(protected)/(rankings)/models/RankingEntryDto'
import { useRequests } from '@/app/hooks/useRequests'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { RankingFilters } from '../models/RankingFilters'

export function useRankings() {
  const executeRequest = useRequests()
  const getRankings = useCallback(
    ({
      categoryId = null,
      discipline = null,
      subDiscipline = null,
      page = 1,
      pageSize = 20
    }: RankingFilters = {}): Promise<PaginatedResponse<RankingEntryDto[]>> =>
      executeRequest<PaginatedResponse<RankingEntryDto[]>>('/getRankings', {
        categoryId,
        discipline,
        subDiscipline,
        page,
        pageSize
      }),
    [executeRequest]
  )

  return { getRankings }
}
