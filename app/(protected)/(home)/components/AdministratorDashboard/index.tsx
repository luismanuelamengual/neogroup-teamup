'use client'

import './index.scss'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import OrganizationStats from '@/app/(protected)/(home)/components/OrganizationStats'
import OverduePaymentsBanner from '@/app/(protected)/(payments)/components/OverduePaymentsBanner'
import { useOverduePayments } from '@/app/(protected)/(payments)/hooks/useOverduePayments'
import { useUserStore } from '@/app/stores/users'

/**
 * Home dashboard of the organization administrator.
 *
 * Mirrors the organizer dashboard header and organization metrics, but without
 * the active tournaments listing (and without the "create tournament" action):
 * the administrator manages users, not tournaments. The unpaid-tournaments
 * reminder is shared, since the debt belongs to the organization.
 */
export default function AdministratorDashboard() {
  const user = useUserStore((state) => state.user)
  const firstName = user?.firstName || user?.displayName || ''
  const { overdueCount } = useOverduePayments()

  return (
    <div className="administrator-dashboard">
      <OverduePaymentsBanner count={overdueCount} />

      <Paper className="hero" elevation={0}>
        <div className="hero-text">
          <Typography variant="h5" component="h1" className="greeting">
            Hola, {firstName}
          </Typography>
          <Typography className="subtitle">Resumen de la actividad de tu organización</Typography>
        </div>
      </Paper>

      <section className="block">
        <OrganizationStats />
      </section>
    </div>
  )
}
