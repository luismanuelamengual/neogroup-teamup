'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from 'next/link'
import { usePaymentsStore } from '@/app/(protected)/(payments)/stores/payments'

/**
 * Reminder shown on the organizer / administrator home when the organization has
 * tournaments that started more than two months ago and are still unpaid. While
 * that is the case no new tournament can be created, so the banner says so.
 *
 * Reads straight from usePaymentsStore, populated once at sign-in by
 * OverduePaymentsLoader — the caller only decides whether to mount this at all
 * (see the `isProduction` gate in the dashboards).
 */
export default function OverduePaymentsBanner() {
  const overdueCount = usePaymentsStore((state) => state.overdueCount)

  if (overdueCount === 0) {
    return null
  }

  return (
    <Alert
      severity="warning"
      action={
        <Button color="inherit" size="small" component={Link} href="/payments">
          Ir a Pagos
        </Button>
      }
    >
      Tenés {overdueCount} {overdueCount === 1 ? 'torneo' : 'torneos'} con más de dos meses sin abonar. Regularizá los
      pagos pendientes para poder crear nuevos torneos.
    </Alert>
  )
}
