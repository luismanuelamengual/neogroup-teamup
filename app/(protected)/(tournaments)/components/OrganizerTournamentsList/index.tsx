'use client'

import './index.scss'
import Pagination from '@mui/material/Pagination'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { getOrganizerTournaments } from '@/app/(protected)/(tournaments)/actions/tournament'
import TournamentCard, { TournamentCardSkeleton } from '@/app/(protected)/(tournaments)/components/TournamentCard'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
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
      <div className="organizer-tournaments-list">
        <div className="list">
          {Array.from({ length: 3 }).map((_, i) => (
            <TournamentCardSkeleton key={i} />
          ))}
        </div>
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
    <div className="organizer-tournaments-list">
      <div className="list">
        {tournaments.map((tournament) => (
          <TournamentCard key={tournament.id} tournament={tournament} />
        ))}
      </div>
      {pageCount > 1 && (
        <Pagination className="paginator" count={pageCount} page={page} onChange={handlePageChange} color="primary" />
      )}
    </div>
  )
}
