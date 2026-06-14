'use client'

import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { getPlayerActiveTournaments } from '@/app/(tournaments)/actions/registration'
import TournamentCard from '@/app/(tournaments)/components/TournamentCard'
import { Tournament } from '@/app/(tournaments)/models/Tournament'

export default function PlayerTournamentsList() {
  const t = useTranslations('player')
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    getPlayerActiveTournaments().then((data) => {
      if (!cancelled) {
        setTournaments(data)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <CircularProgress />
      </div>
    )
  }

  if (tournaments.length === 0) {
    return (
      <div className="empty">
        <Typography color="text.secondary">{t('myTournamentsEmpty')}</Typography>
        <Button component={Link} href="/tournaments/search" variant="contained" startIcon={<SearchIcon />}>
          {t('findTournaments')}
        </Button>
      </div>
    )
  }

  return (
    <div className="list">
      {tournaments.map((tournament) => (
        <TournamentCard key={tournament.id} tournament={tournament} />
      ))}
    </div>
  )
}
