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
  // Same search, scoped to a tournament: the server excludes players already
  // registered as competitors in it, so the (paginated, limit-10) picker
  // doesn't run dry as competitors get added — see the route's own comment.
  const getPlayersForJoin = useCallback(
    async (tournamentId: number, query: string, excludeIds: number[] = []): Promise<UserDto[]> => {
      const normalized = query.trim()

      if (normalized.length === 1) {
        return []
      }

      return executeRequest<UserDto[]>('/getPlayersForJoin', { tournamentId, query: normalized, excludeIds })
    },
    [executeRequest]
  )

  return { getPlayers, getPlayersForJoin }
}
