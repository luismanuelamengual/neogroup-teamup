'use client'

import './index.scss'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import OrganizationStats from '@/app/(protected)/(home)/components/OrganizationStats'
import OverduePaymentsBanner from '@/app/(protected)/(payments)/components/OverduePaymentsBanner'
import { useOverduePayments } from '@/app/(protected)/(payments)/hooks/useOverduePayments'
import TournamentsBrowser from '@/app/(protected)/(tournaments)/components/TournamentsBrowser'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { useUserStore } from '@/app/stores/users'

export default function OrganizerDashboard() {
  const user = useUserStore((state) => state.user)
  const firstName = user?.firstName || user?.displayName || ''
  const { overdueCount } = useOverduePayments()
  const blocked = overdueCount > 0

  return (
    <div className="organizer-dashboard">
      <OverduePaymentsBanner count={overdueCount} />

      <Paper className="hero" elevation={0}>
        <div className="hero-text">
          <Typography variant="h5" component="h1" className="greeting">
            Hola, {firstName}
          </Typography>
          <Typography className="subtitle">Resumen de tu actividad y de tu organización</Typography>
        </div>
        <Tooltip title={blocked ? 'Regularizá los pagos pendientes para crear nuevos torneos' : ''}>
          {/* Wrapped in a span so the tooltip still fires while the button is disabled. */}
          <span className="hero-action">
            <Button
              href={blocked ? undefined : '/tournaments/new'}
              variant="contained"
              startIcon={<AddIcon />}
              disabled={blocked}
            >
              Crear torneo
            </Button>
          </span>
        </Tooltip>
      </Paper>

      <section className="block">
        <OrganizationStats />
      </section>

      <section className="block">
        <Typography variant="h6" className="block-title">
          Torneos activos
        </Typography>
        <TournamentsBrowser showFilters={false} states={[TournamentStatus.STAND_BY, TournamentStatus.ONGOING]} />
      </section>
    </div>
  )
}
