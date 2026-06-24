'use client'

import { useTranslations } from 'next-intl'
import { useCallback } from 'react'
import type { Role } from '@/app/(auth)/models/Role'
import type { AccountInput } from '@/app/(protected)/(account)/models/AccountInput'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useRequests } from '@/app/hooks/useRequests'

export function useAccount() {
  const t = useTranslations('account')
  const executeRequest = useRequests()
  const { showSuccessMessage } = useNotifications()
  const updateAccount = useCallback(
    async (input: AccountInput): Promise<void> => {
      try {
        await executeRequest('/updateAccount', input)
        showSuccessMessage(t('saved'))
      } catch (e) {}
    },
    [executeRequest, showSuccessMessage, t]
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
