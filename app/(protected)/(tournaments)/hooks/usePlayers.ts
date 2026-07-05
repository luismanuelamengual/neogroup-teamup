'use client'

import { useCallback } from 'react'
import { useRequests } from '@/app/hooks/useRequests'
import { UserDto } from '@/app/models/UserDto'

export function usePlayers() {
  const executeRequest = useRequests()
  const getPlayers = useCallback(
    async (query: string): Promise<UserDto[]> => {
      const normalized = query.trim()

      if (normalized.length < 2) {
        return []
      }

      return executeRequest<UserDto[]>('/getPlayers', { query: normalized })
    },
    [executeRequest]
  )

  return { getPlayers }
}
