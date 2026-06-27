'use client'

import { useCallback } from 'react'
import type { AccountInput } from '@/app/(protected)/(account)/models/AccountInput'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useRequests } from '@/app/hooks/useRequests'
import type { Role } from '@/app/models/Role'

export function useAccount() {
  const executeRequest = useRequests()
  const { showSuccessMessage } = useNotifications()
  const updateAccount = useCallback(
    async (input: AccountInput): Promise<void> => {
      try {
        await executeRequest('/updateAccount', input)
        showSuccessMessage('Datos guardados correctamente')
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage]
  )
  const setRole = useCallback(
    (roleId: Role): Promise<void> => executeRequest('/updateAccount', { roleId }),
    [executeRequest]
  )

  return { updateAccount, setRole }
}
