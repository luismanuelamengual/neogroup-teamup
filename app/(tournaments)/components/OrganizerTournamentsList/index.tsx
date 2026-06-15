'use client'

import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { getOrganizerTournaments } from '@/app/(tournaments)/actions/tournament'
import TournamentCard from '@/app/(tournaments)/components/TournamentCard'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'

interface OrganizerTournamentsListProps {
  name: string
  onlyActive: boolean
}

export default function OrganizerTournamentsList({ name, onlyActive }: OrganizerTournamentsListProps) {
  const t = useTranslations('organizer')
  const [tournaments, setTournaments] = useState<TournamentDto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    getOrganizerTournaments({ name: name || undefined, onlyActive }).then((data) => {
      if (!cancelled) {
        setTournaments(data)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [name, onlyActive])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <CircularProgress />
      </div>
    )
  }

  if (tournaments.length === 0) {
    return (
      <Typography color="text.secondary" className="empty">
        {t('empty')}
      </Typography>
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
