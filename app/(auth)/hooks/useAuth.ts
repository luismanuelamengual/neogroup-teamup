'use client'

import { useCallback } from 'react'
import { RegisterInput } from '@/app/(auth)/models/RegisterInput'
import { useRequests } from '@/app/hooks/useRequests'

export function useAuth() {
  const executeRequest = useRequests()
  const registerUser = useCallback(
    (input: RegisterInput): Promise<{ id: number }> => executeRequest<{ id: number }>('/registerUser', input),
    [executeRequest]
  )

  return { registerUser }
}
