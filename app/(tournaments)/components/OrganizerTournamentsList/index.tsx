'use client'

import CircularProgress from '@mui/material/CircularProgress'
import Pagination from '@mui/material/Pagination'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { getOrganizerTournaments } from '@/app/(tournaments)/actions/tournament'
import TournamentCard from '@/app/(tournaments)/components/TournamentCard'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'
import { useLoadingData } from '@/app/hooks/useLoadingData'

interface OrganizerTournamentsListProps {
  name: string
  onlyActive: boolean
}

export default function OrganizerTournamentsList({ name, onlyActive }: OrganizerTournamentsListProps) {
  const t = useTranslations('organizer')
  const [tournaments, setTournaments] = useState<TournamentDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const { loading } = useLoadingData(async () => {
    const { data: tournaments, lastPage } = await getOrganizerTournaments({
      name,
      onlyActive,
      page
    })

    setTournaments(tournaments)
    setPageCount(lastPage)
  }, [name, onlyActive, page])

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
      <Typography color="text.secondary" className="empty">
        {t('empty')}
      </Typography>
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
