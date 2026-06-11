'use client'

import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { getPlayerActiveTournaments } from '@/app/_actions/registration'
import TournamentCard from '@/app/_components/tournament/TournamentCard'
import { TournamentDto } from '@/app/_models/dtos'

export default function PlayerTournamentsList() {
  const t = useTranslations('player')
  const [tournaments, setTournaments] = useState<TournamentDto[]>([])
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
      <div className="player-tournaments__empty">
        <Typography color="text.secondary">{t('myTournamentsEmpty')}</Typography>
        <Button component={Link} href="/player/search" variant="contained" startIcon={<SearchIcon />}>
          {t('findTournaments')}
        </Button>
      </div>
    )
  }

  return (
    <div className="player-tournaments__list">
      {tournaments.map((tournament) => (
        <TournamentCard key={tournament.id} tournament={tournament} href={`/player/tournaments/${tournament.id}`} />
      ))}
    </div>
  )
}
