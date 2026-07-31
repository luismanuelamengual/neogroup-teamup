'use client'

import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from 'next/link'

/**
 * Reminder shown on the organizer / administrator home when the organization has
 * tournaments that started more than a month ago and are still unpaid. While
 * that is the case no new tournament can be created, so the banner says so.
 *
 * Presentational on purpose: the count comes from `useOverduePayments`, which
 * the dashboard already needs in order to disable its "create tournament"
 * action, so the debt is fetched once per screen.
 */
export default function OverduePaymentsBanner({ count }: { count: number }) {
  if (count === 0) {
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
      Tenés {count} {count === 1 ? 'torneo' : 'torneos'} con más de un mes sin abonar. Regularizá los pagos pendientes
      para poder crear nuevos torneos.
    </Alert>
  )
}
