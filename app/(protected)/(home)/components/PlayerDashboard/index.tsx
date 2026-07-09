'use client'

import './index.scss'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import PlayerStats from '@/app/(protected)/(home)/components/PlayerStats'
import TournamentsBrowser from '@/app/(protected)/(tournaments)/components/TournamentsBrowser'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { useUserStore } from '@/app/stores/users'

export default function PlayerDashboard() {
  const user = useUserStore((state) => state.user)
  const firstName = user?.firstName || user?.displayName || ''

  return (
    <div className="player-dashboard">
      <Paper className="hero" elevation={0}>
        <div className="hero-text">
          <Typography variant="h5" component="h1" className="greeting">
            Hola, {firstName}
          </Typography>
          <Typography className="subtitle">Este es tu resumen de actividad</Typography>
        </div>
        <EmojiEventsIcon className="hero-icon" />
      </Paper>

      <section className="player-stats">
        <PlayerStats />
      </section>

      <section className="panel">
        <Typography variant="h6" className="panel-title">
          Tus torneos activos
        </Typography>
        <TournamentsBrowser
          showFilters={false}
          states={[TournamentStatus.STAND_BY, TournamentStatus.ONGOING]}
          ownedByPlayer
          emptyState={
            <>
              No tienes torneos activos
              <br />
              <br />
              <Button href="/tournaments" variant="contained" startIcon={<SearchIcon />}>
                Buscar torneos
              </Button>
            </>
          }
        />
      </section>
    </div>
  )
}
