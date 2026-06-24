'use client'

import { useCallback } from 'react'
import { UserDto } from '@/app/(auth)/models/UserDto'
import { useRequests } from '@/app/hooks/useRequests'

export function useUsers() {
  const executeRequest = useRequests()
  const getUsers = useCallback(
    async (query: string): Promise<UserDto[]> => {
      const normalized = query.trim()

      if (normalized.length < 2) {
        return []
      }

      return executeRequest<UserDto[]>('/getUsers', { query: normalized })
    },
    [executeRequest]
  )

  return { getUsers }
}
