'use client'

import { usePayments } from '@/app/(protected)/(payments)/hooks/usePayments'
import { useLoadingData } from '@/app/hooks/useLoadingData'

/**
 * Tournaments of the organization that started more than a month ago and are
 * still unpaid. While there is at least one, the home dashboards show a reminder
 * and the creation of new tournaments is blocked (the server enforces it too).
 *
 * `enabled` exists because the endpoint is organizer/administrator-only: screens
 * shared with players (the tournaments browser) ask for the debt only when they
 * are actually rendering the creation action.
 */
export function useOverduePayments(enabled = true): { overdueCount: number; loading: boolean } {
  const { getPendingPayments } = usePayments()
  const { data, loading } = useLoadingData(
    () => (enabled ? getPendingPayments() : Promise.resolve(null)),
    [getPendingPayments, enabled],
    null
  )

  return { overdueCount: data?.overdueCount ?? 0, loading }
}
