'use client'

import './index.scss'
import SearchIcon from '@mui/icons-material/Search'
import InputAdornment from '@mui/material/InputAdornment'
import Pagination from '@mui/material/Pagination'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import MuiToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { getPlayerActiveTournaments, searchTournaments } from '@/app/(protected)/(tournaments)/actions/tournament'
import TournamentCard, { TournamentCardSkeleton } from '@/app/(protected)/(tournaments)/components/TournamentCard'
import { useDebouncedValue } from '@/app/(protected)/(tournaments)/hooks/useDebouncedValue'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { useLoadingData } from '@/app/hooks/useLoadingData'

type StatusFilter = TournamentStatus | 'all'

export interface TournamentsBrowserProps {
  /** Whether to show the name/status filter bar. Defaults to true. */
  showFilters?: boolean
  /** Restrict which statuses are fetched. When set, only these statuses are queried and the status toggle is hidden. */
  states?: TournamentStatus[]
  /** When true, only shows tournaments where the signed-in user participates as a competitor. */
  ownedByPlayer?: boolean
}

export default function TournamentsBrowser({ showFilters = true, states, ownedByPlayer = false }: TournamentsBrowserProps) {
  const t = useTranslations('tournaments')
  const [nameInput, setNameInput] = useState('')
  const debouncedName = useDebouncedValue(nameInput)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [tournaments, setTournaments] = useState<TournamentDto[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    setPage(1)
  }, [debouncedName, status])

  const { loading } = useLoadingData(async () => {
    const name = debouncedName.trim() || undefined
    const statuses = states ?? (status === 'all' ? undefined : [status as TournamentStatus])

    const { data, lastPage } = ownedByPlayer
      ? await getPlayerActiveTournaments({ name, statuses, page })
      : await searchTournaments({ name, statuses, page })

    setTournaments(data)
    setPageCount(lastPage)
  }, [ownedByPlayer, states, debouncedName, status, page])

  return (
    <div className="tournaments-browser">
      {showFilters && (
        <div className="filters">
          <TextField
            size="small"
            placeholder={t('browse.filterByName')}
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            className="name-filter"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                )
              }
            }}
          />
          {!states && (
            <MuiToggleButtonGroup
              size="small"
              color="primary"
              exclusive
              value={status}
              onChange={(_, value: StatusFilter | null) => value && setStatus(value)}
              className="status-filter"
            >
              <ToggleButton value="all">{t('browse.all')}</ToggleButton>
              <ToggleButton value={TournamentStatus.STAND_BY}>{t('status.stand_by')}</ToggleButton>
              <ToggleButton value={TournamentStatus.ONGOING}>{t('status.ongoing')}</ToggleButton>
              <ToggleButton value={TournamentStatus.FINISHED}>{t('status.finished')}</ToggleButton>
            </MuiToggleButtonGroup>
          )}
        </div>
      )}

      {loading ? (
        <div className="list">
          {Array.from({ length: 4 }).map((_, i) => (
            <TournamentCardSkeleton key={i} />
          ))}
        </div>
      ) : tournaments.length === 0 ? (
        <Typography color="text.secondary" className="empty">
          {t('browse.empty')}
        </Typography>
      ) : (
        <>
          <div className="list">
            {tournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </div>
          {pageCount > 1 && (
            <Pagination
              className="paginator"
              count={pageCount}
              page={page}
              onChange={(_, value) => setPage(value)}
              color="primary"
            />
          )}
        </>
      )}
    </div>
  )
}
