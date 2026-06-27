'use client'

import './index.scss'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import OrganizationStats from '@/app/(protected)/(home)/components/OrganizationStats'
import TournamentsBrowser from '@/app/(protected)/(tournaments)/components/TournamentsBrowser'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { useUserStore } from '@/app/stores/users'

export default function OrganizerDashboard() {
  const user = useUserStore((state) => state.user)
  const firstName = user?.firstName || user?.displayName || ''

  return (
    <div className="organizer-dashboard">
      <Paper className="hero" elevation={0}>
        <div className="hero-text">
          <Typography variant="h5" component="h1" className="greeting">
            Hola, {firstName}
          </Typography>
          <Typography className="subtitle">Resumen de tu actividad y de tu organización</Typography>
        </div>
        <Button href="/tournaments/new" variant="contained" startIcon={<AddIcon />} className="hero-action">
          Crear torneo
        </Button>
      </Paper>

      <section className="block">
        <div className="stats">
          <OrganizationStats />
        </div>
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
