'use client'

import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { searchTournaments } from '@/app/(tournaments)/actions/registration'
import TournamentCard from '@/app/(tournaments)/components/TournamentCard'
import { TournamentDto } from '@/app/(tournaments)/models/dtos'

interface TournamentSearchResultsProps {
  query: string
}

export default function TournamentSearchResults({ query }: TournamentSearchResultsProps) {
  const t = useTranslations('player')
  const [tournaments, setTournaments] = useState<TournamentDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    searchTournaments(query).then((data) => {
      if (!cancelled) {
        setTournaments(data)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [query])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <CircularProgress />
      </div>
    )
  }

  if (tournaments.length === 0) {
    return (
      <Typography color="text.secondary" className="player-search__empty">
        {t('searchEmpty')}
      </Typography>
    )
  }

  return (
    <div className="player-search__list">
      {tournaments.map((tournament) => (
        <TournamentCard key={tournament.id} tournament={tournament} href={`/tournaments/${tournament.id}`} />
      ))}
    </div>
  )
}
