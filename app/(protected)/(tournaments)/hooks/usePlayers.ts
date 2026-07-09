'use client'

import { useCallback } from 'react'
import { useRequests } from '@/app/hooks/useRequests'
import { UserDto } from '@/app/models/UserDto'

export function usePlayers() {
  const executeRequest = useRequests()
  const getPlayers = useCallback(
    async (query: string): Promise<UserDto[]> => {
      const normalized = query.trim()

      // A single character is too broad to search on, but an empty query is valid:
      // it asks the server for a default list of players.
      if (normalized.length === 1) {
        return []
      }

      return executeRequest<UserDto[]>('/getPlayers', { query: normalized })
    },
    [executeRequest]
  )

  return { getPlayers }
}
