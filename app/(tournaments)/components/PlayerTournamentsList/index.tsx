'use client'

import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Pagination from '@mui/material/Pagination'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { getPlayerActiveTournaments } from '@/app/(tournaments)/actions/tournament'
import TournamentCard from '@/app/(tournaments)/components/TournamentCard'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'

const PAGE_SIZE = 10

export default function PlayerTournamentsList() {
  const t = useTranslations('player')
  const [tournaments, setTournaments] = useState<TournamentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

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

  const pageCount = Math.ceil(tournaments.length / PAGE_SIZE)
  const paginated = tournaments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <div className="list">
        {paginated.map((tournament) => (
          <TournamentCard key={tournament.id} tournament={tournament} />
        ))}
      </div>
      {pageCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <Pagination count={pageCount} page={page} onChange={(_, value) => setPage(value)} color="primary" />
        </div>
      )}
    </>
  )
}
