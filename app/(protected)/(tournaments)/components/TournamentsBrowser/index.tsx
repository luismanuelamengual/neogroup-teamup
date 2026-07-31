'use client'

import './index.scss'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import Pagination from '@mui/material/Pagination'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import { useRouter, useSearchParams } from 'next/navigation'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { useOverduePayments } from '@/app/(protected)/(payments)/hooks/useOverduePayments'
import TournamentCard, { TournamentCardSkeleton } from '@/app/(protected)/(tournaments)/components/TournamentCard'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import MessagePanel from '@/app/components/MessagePanel'
import { useDebouncedValue } from '@/app/hooks/useDebouncedValue'
import { useLoadingData } from '@/app/hooks/useLoadingData'
import TournamentStateSelector from './TournamentStateSelector'

type StatusFilter = TournamentStatus | 'all'

export interface TournamentsBrowserProps {
  emptyState?: ReactNode
  /** Whether to show the name/status filter bar. Defaults to true. */
  showFilters?: boolean
  showCreationButton?: boolean
  /** Restrict which statuses are fetched. When set, only these statuses are queried and the status toggle is hidden. */
  states?: TournamentStatus[]
  /** When true, only shows tournaments where the signed-in user participates as a competitor. */
  ownedByPlayer?: boolean
}

export default function TournamentsBrowser({
  emptyState = undefined,
  showFilters = true,
  showCreationButton = false,
  states,
  ownedByPlayer = false
}: TournamentsBrowserProps) {
  const { getTournaments } = useTournaments()
  // Only asked for when the creation action is on screen (organizers).
  const { overdueCount } = useOverduePayments(showCreationButton)
  const creationBlocked = overdueCount > 0
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlName = searchParams.get('name') ?? ''
  const rawStatus = searchParams.get('status')
  const urlStatus: StatusFilter = rawStatus ? (parseInt(rawStatus) as TournamentStatus) : 'all'
  const urlPage = parseInt(searchParams.get('page') ?? '1') || 1
  const [nameInput, setNameInput] = useState(urlName)
  const [status, setStatus] = useState<StatusFilter>(urlStatus)
  const debouncedName = useDebouncedValue(nameInput)
  const [tournaments, setTournaments] = useState<TournamentDto[]>([])
  const [page, setPage] = useState(urlPage)
  const [pageCount, setPageCount] = useState(1)
  const lastPushed = useRef({ name: urlName, status: urlStatus, page: urlPage })
  const prevFilters = useRef({ name: debouncedName, status })

  useEffect(() => {
    const params = new URLSearchParams()

    if (debouncedName) {
      params.set('name', debouncedName)
    }

    if (status !== 'all') {
      params.set('status', String(status))
    }

    if (page > 1) {
      params.set('page', String(page))
    }

    lastPushed.current = { name: debouncedName, status, page }
    router.push(`?${params.toString()}`, { scroll: false })
  }, [debouncedName, router, status, page])

  useEffect(() => {
    if (urlName !== lastPushed.current.name) {
      setNameInput(urlName)
    }

    if (urlStatus !== lastPushed.current.status) {
      setStatus(urlStatus)
    }

    if (urlPage !== lastPushed.current.page) {
      setPage(urlPage)
    }
  }, [urlName, urlStatus, urlPage])

  useEffect(() => {
    if (prevFilters.current.name === debouncedName && prevFilters.current.status === status) {
      return
    }

    prevFilters.current = { name: debouncedName, status }
    setPage(1)
  }, [debouncedName, status])

  const { loading } = useLoadingData(async () => {
    const name = debouncedName.trim() || undefined
    const statuses = states ?? (status === 'all' ? undefined : [status as TournamentStatus])
    const { data, lastPage } = ownedByPlayer
      ? await getTournaments({
          name,
          statuses: [TournamentStatus.STAND_BY, TournamentStatus.ONGOING],
          ownedByPlayer: true,
          page
        })
      : await getTournaments({ name, statuses, page })

    setTournaments(data)
    setPageCount(lastPage)
  }, [ownedByPlayer, states, debouncedName, status, page])

  return (
    <div className="tournaments-browser">
      {showFilters && (
        <div className="header">
          <div className="filters">
            <TextField
              size="small"
              placeholder="Buscar por nombre"
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
            {!states && <TournamentStateSelector value={status} onChange={setStatus} className="state-filter" />}
          </div>
          {showCreationButton && (
            <div className="actions">
              <Tooltip title={creationBlocked ? 'Regularizá los pagos pendientes para crear nuevos torneos' : ''}>
                {/* Wrapped in a span so the tooltip still fires while the button is disabled. */}
                <span className="create-button">
                  <Button
                    href={creationBlocked ? undefined : '/tournaments/new'}
                    variant="contained"
                    startIcon={<AddIcon />}
                    disabled={creationBlocked}
                  >
                    Crear torneo
                  </Button>
                </span>
              </Tooltip>
            </div>
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
        <MessagePanel>{emptyState ?? <>No se encontraron torneos</>}</MessagePanel>
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
