'use client'

import { useEffect } from 'react'
import { usePayments } from '@/app/(protected)/(payments)/hooks/usePayments'
import { usePaymentsStore } from '@/app/(protected)/(payments)/stores/payments'
import { useUserStore } from '@/app/(protected)/stores/users'
import { Role } from '@/app/models/Role'

/**
 * Fetches the organization's overdue-payments count once, right after
 * sign-in, and stores it in usePaymentsStore. Every screen that needs the
 * count (OverduePaymentsBanner, the "create tournament" actions...) reads it
 * straight from that store afterwards, for free, instead of each hitting the
 * database on its own.
 *
 * /getPendingPayments is organizer/administrator-only, so this only fetches
 * for those two roles. Rendered right after UserStoreHydrator in the
 * protected layout, so the role is already in the user store by the time this
 * effect runs.
 */
export default function OverduePaymentsLoader() {
  const roleId = useUserStore((state) => state.user?.roleId)
  const { getPendingPayments } = usePayments()
  const setOverdueCount = usePaymentsStore((state) => state.setOverdueCount)

  useEffect(() => {
    if (roleId !== Role.ORGANIZER && roleId !== Role.ADMINISTRATOR) {
      return
    }

    let cancelled = false

    getPendingPayments().then((data) => {
      if (!cancelled) {
        setOverdueCount(data?.overdueCount ?? 0)
      }
    })

    return () => {
      cancelled = true
    }
  }, [roleId, getPendingPayments, setOverdueCount])

  return null
}
