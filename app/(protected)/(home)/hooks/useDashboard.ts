'use client'

import { useCallback } from 'react'
import { OrganizationStatisticsDto } from '@/app/(protected)/(home)/models/OrganizationStatisticsDto'
import { PlayerStatisticsDto } from '@/app/(protected)/(home)/models/PlayerStatisticsDto'
import { UpcomingMatchDto } from '@/app/(protected)/(home)/models/UpcomingMatchDto'
import { useRequests } from '@/app/hooks/useRequests'

export function useDashboard() {
  const executeRequest = useRequests()
  const getPlayerStats = useCallback(
    (): Promise<PlayerStatisticsDto> => executeRequest<PlayerStatisticsDto>('/getPlayerStats'),
    [executeRequest]
  )
  const getOrganizationStats = useCallback(
    (): Promise<OrganizationStatisticsDto> => executeRequest<OrganizationStatisticsDto>('/getOrganizationStats'),
    [executeRequest]
  )
  const getUpcomingMatches = useCallback(
    (): Promise<UpcomingMatchDto[]> => executeRequest<UpcomingMatchDto[]>('/getUpcomingMatches'),
    [executeRequest]
  )

  return { getPlayerStats, getOrganizationStats, getUpcomingMatches }
}
