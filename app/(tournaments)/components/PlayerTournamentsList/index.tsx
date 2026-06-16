'use client'

import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Pagination from '@mui/material/Pagination'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { getPlayerActiveTournaments } from '@/app/(tournaments)/actions/tournament'
import TournamentCard from '@/app/(tournaments)/components/TournamentCard'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'
import { useLoadingData } from '@/app/hooks/useLoadingData'

export default function PlayerTournamentsList() {
  const t = useTranslations('player')
  const [tournaments, setTournaments] = useState<TournamentDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const { loading } = useLoadingData(async () => {
    const { data: tournaments, lastPage } = await getPlayerActiveTournaments({
      page
    })

    setTournaments(tournaments)
    setPageCount(lastPage)
  }, [page])

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value)
  }

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
    <>
      <div className="list">
        {tournaments.map((tournament) => (
          <TournamentCard key={tournament.id} tournament={tournament} />
        ))}
      </div>
      {pageCount > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <Pagination count={pageCount} page={page} onChange={handlePageChange} color="primary" />
        </div>
      )}
    </>
  )
}
