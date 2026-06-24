'use client'

import { useCallback } from 'react'
import type { Role } from '@/app/(auth)/models/Role'
import type { AccountInput } from '@/app/(protected)/(account)/models/AccountInput'
import { useRequests } from '@/app/hooks/useRequests'

export function useAccount() {
  const executeRequest = useRequests()
  const updateAccount = useCallback(
    (input: AccountInput): Promise<void> => executeRequest('/updateAccount', input),
    [executeRequest]
  )
  const setRole = useCallback(
    (roleId: Role): Promise<void> => executeRequest('/updateAccount', { roleId }),
    [executeRequest]
  )
  const setLocale = useCallback(
    (locale: string): Promise<void> => executeRequest('/updateAccount', { locale }),
    [executeRequest]
  )

  return { updateAccount, setRole, setLocale }
}
