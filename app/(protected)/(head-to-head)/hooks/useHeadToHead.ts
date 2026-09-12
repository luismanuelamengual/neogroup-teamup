'use client'

import { useCallback } from 'react'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { useRequests } from '@/app/hooks/useRequests'

export function useHeadToHead() {
  const executeRequest = useRequests()
  // Every match two sides have played against each other, across every
  // tournament of the organization. They come back exactly as they are stored
  // (the side that played at home that day is still the home side); the view
  // orients them to its own sides.
  const getHeadToHeadMatches = useCallback(
    (homePlayerIds: number[], awayPlayerIds: number[]): Promise<MatchDto[]> =>
      executeRequest<MatchDto[]>('/getHeadToHead', { homePlayerIds, awayPlayerIds }),
    [executeRequest]
  )

  return { getHeadToHeadMatches }
}
