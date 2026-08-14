'use client'

import './index.scss'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Pagination from '@mui/material/Pagination'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useMemo, useState } from 'react'
import MatchCard from '@/app/(protected)/(tournaments)/components/MatchCard'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { isMatchEditable } from '@/app/(protected)/(tournaments)/utils/matches'
import { allowsUnorderedResults } from '@/app/(protected)/(tournaments)/utils/settings'
import MessagePanel from '@/app/components/MessagePanel'
import { useUserStore } from '@/app/stores/users'
import { foldForSearch, searchTerms } from '@/app/utils/text'

interface FixtureViewProps {
  tournament: TournamentDto
  category?: number
  /** Group index when rendering the group phase of a groups+playoff tournament. */
  groupNumber?: number | null
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
}

interface RoundGroup {
  number: number
  matches: MatchDto[]
  open: boolean
}

/** Status filter offered when results can be loaded in any order. */
type StatusFilter = 'all' | 'pending' | 'finished'

/**
 * Matches per page. Twelve fills three or four full rows on a wide grid and
 * still keeps the single-column phone layout to a reasonable scroll.
 */
const MATCHES_PER_PAGE = 12

/**
 * Display order for the match list: first by state — organizers want the
 * matches still awaiting a result up front, players want their finished
 * matches up front — then chronologically by scheduled date/time (matches
 * still missing a date or hour sort after every scheduled one), and finally
 * by `createdAt` as a stable tie-breaker.
 */
function compareMatches(a: MatchDto, b: MatchDto, organizerMode: boolean): number {
  const isPending = (match: MatchDto) => match.status === MatchStatus.PENDING

  const statusRank = (match: MatchDto) => {
    const pending = isPending(match)

    return organizerMode ? (pending ? 0 : 1) : pending ? 1 : 0
  }

  const statusDiff = statusRank(a) - statusRank(b)

  if (statusDiff !== 0) {
    return statusDiff
  }

  const dateTime = (match: MatchDto) =>
    match.date != null && match.hour != null ? `${match.date}T${match.hour}` : null
  const dateTimeA = dateTime(a)
  const dateTimeB = dateTime(b)

  if (dateTimeA !== dateTimeB) {
    if (dateTimeA == null) {
      return 1
    }

    if (dateTimeB == null) {
      return -1
    }

    return dateTimeA < dateTimeB ? -1 : 1
  }

  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
}

/** Rounds + matches list used by leagues, americano and group-phase fixtures. */
export default function FixtureView({
  tournament,
  category,
  groupNumber = null,
  organizerMode = false,
  onEditMatch
}: FixtureViewProps) {
  const userId = useUserStore((state) => state.user?.id ?? null)
  // With unordered results the rounds are just how the schedule was laid out:
  // every fixture exists from the start and none is more current than another.
  // The view drops the round navigation entirely and lists the whole schedule.
  const unordered = allowsUnorderedResults(tournament.type, tournament.settings)
  // Matches of the round-robin (LEAGUE) lane for the requested category/group.
  // Voided fixtures are dropped: they will never be played, so showing them
  // would just be noise.
  const laneMatches = useMemo(
    () =>
      (tournament.matches ?? []).filter(
        (m) =>
          (category == null || m.tournamentCategoryId === category) &&
          (m.groupNumber ?? null) === (groupNumber ?? null) &&
          m.type === MatchType.LEAGUE &&
          m.status !== MatchStatus.VOID
      ),
    [tournament.matches, category, groupNumber]
  )
  const rounds = useMemo<RoundGroup[]>(() => {
    const byNumber = new Map<number, MatchDto[]>()

    for (const match of laneMatches) {
      if (!byNumber.has(match.roundNumber)) {
        byNumber.set(match.roundNumber, [])
      }

      byNumber.get(match.roundNumber)!.push(match)
    }

    return [...byNumber.entries()]
      .map(([number, matches]) => ({
        number,
        matches: [...matches].sort((a, b) => a.position - b.position),
        open: matches.some((m) => m.status === MatchStatus.PENDING)
      }))
      .sort((a, b) => a.number - b.number)
  }, [laneMatches])
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null)
  // Resolve which round to show: use the selection if valid, otherwise the last.
  const activeRoundNumber = useMemo(() => {
    if (rounds.length === 0) {
      return null
    }

    if (selectedRoundNumber != null && rounds.some((r) => r.number === selectedRoundNumber)) {
      return selectedRoundNumber
    }

    return rounds[rounds.length - 1]!.number
  }, [rounds, selectedRoundNumber])
  const activeRoundIndex = useMemo(
    () => rounds.findIndex((r) => r.number === activeRoundNumber),
    [rounds, activeRoundNumber]
  )
  const { editableMatchIds, highlightedMatchIds } = useMemo(() => {
    const categoryMatches = (tournament.matches ?? []).filter(
      (m) => category == null || m.tournamentCategoryId === category
    )
    const editable = laneMatches.filter((m) =>
      isMatchEditable(m, categoryMatches, tournament.type, tournament.status, tournament.settings)
    )

    if (organizerMode) {
      return { editableMatchIds: editable.map((m) => m.id), highlightedMatchIds: [] as number[] }
    }

    const userEntry = (tournament.competitors ?? []).find((c) => userId != null && c.playerIds.includes(userId))

    if (!userEntry) {
      return { editableMatchIds: [] as number[], highlightedMatchIds: [] as number[] }
    }

    const userMatchIds = editable
      .filter((m) => m.homeCompetitorId === userEntry.id || m.awayCompetitorId === userEntry.id)
      .map((m) => m.id)

    // The highlight (marking the player's own current match) always shows;
    // only self-reporting the result is gated behind allowPlayerSetScore —
    // otherwise only an organizer (handled above) can edit it.
    return {
      editableMatchIds: tournament.allowPlayerSetScore ? userMatchIds : [],
      highlightedMatchIds: userMatchIds
    }
  }, [tournament, laneMatches, category, organizerMode, userId])
  const [search, setSearch] = useState('')
  // Every name a competitor can be found by, folded once per competitor rather
  // than on each keystroke. Both the long and the short name are indexed: the
  // cards show the short one, but people type what they know.
  const searchIndex = useMemo(() => {
    const index = new Map<number, string>()

    for (const competitor of tournament.competitors ?? []) {
      index.set(competitor.id, foldForSearch(`${competitor.displayName} ${competitor.shortName}`))
    }

    return index
  }, [tournament.competitors])
  const searchedMatches = useMemo(() => {
    const all = rounds.flatMap((round) => round.matches)
    // Every whitespace-separated word must appear somewhere in the match, but
    // not necessarily in the same competitor: "agui contre" is how you look for
    // Aguilar vs Contreras, and a single "agui" still finds every Aguilar match.
    const terms = searchTerms(search)

    if (terms.length === 0) {
      return all
    }

    return all.filter((match) => {
      const names = [match.homeCompetitorId, match.awayCompetitorId]
        .filter((id): id is number => id != null)
        .map((id) => searchIndex.get(id) ?? '')
        .join(' ')

      return terms.every((term) => names.includes(term))
    })
  }, [rounds, search, searchIndex])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  // What the list shows before paging: the whole (searched and status-filtered)
  // schedule when results come in unordered, otherwise just the active round.
  const listedMatches = useMemo(() => {
    const base = !unordered
      ? (rounds[activeRoundIndex]?.matches ?? [])
      : statusFilter === 'all'
        ? searchedMatches
        : // Anything past PENDING counts as played: WALKOVER has a final result
          // too, and VOID never reaches this list.
          searchedMatches.filter((match) =>
            statusFilter === 'pending' ? match.status === MatchStatus.PENDING : match.status !== MatchStatus.PENDING
          )

    return [...base].sort((a, b) => compareMatches(a, b, organizerMode))
  }, [unordered, rounds, activeRoundIndex, searchedMatches, statusFilter, organizerMode])
  const pageCount = Math.max(1, Math.ceil(listedMatches.length / MATCHES_PER_PAGE))
  // Filters can shrink the list under the current page; clamp rather than reset
  // so that widening them again lands back where the user was.
  const activePage = Math.min(page, pageCount)
  const pagedMatches = useMemo(
    () => listedMatches.slice((activePage - 1) * MATCHES_PER_PAGE, activePage * MATCHES_PER_PAGE),
    [listedMatches, activePage]
  )

  if (laneMatches.length === 0) {
    return null
  }

  const renderMatch = (match: MatchDto) => (
    <MatchCard
      key={match.id}
      match={match}
      tournament={tournament}
      highlighted={highlightedMatchIds.includes(match.id)}
      editable={editableMatchIds.includes(match.id)}
      onEdit={onEditMatch}
    />
  )
  // Only worth rendering once there is somewhere to go. `siblingCount={0}`
  // keeps it to first/current/last on narrow screens instead of overflowing.
  const paginator = pageCount > 1 && (
    <Pagination
      className="paginator"
      count={pageCount}
      page={activePage}
      onChange={(_, value) => setPage(value)}
      color="primary"
      siblingCount={0}
    />
  )

  // No round selector and no "En juego" chip: with nothing in play there is
  // nothing to navigate between, so the whole schedule is one list and any card
  // can take its result. That list can get long (a 10-competitor league is 45
  // matches), hence the search box, the status filter and the paginator.
  if (unordered) {
    return (
      <div className="fixture-view">
        <div className="match-filters">
          <TextField
            size="small"
            placeholder="Buscar por competidor"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            className="match-search"
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
          <ToggleButtonGroup
            size="small"
            exclusive
            color="primary"
            value={statusFilter}
            onChange={(_, value: StatusFilter | null) => {
              // Null means the active button was clicked again: keep the
              // current filter rather than leaving the group unselected.
              if (value != null) {
                setStatusFilter(value)
                setPage(1)
              }
            }}
            className="status-filter"
          >
            <ToggleButton value="all">Todos</ToggleButton>
            <ToggleButton value="pending">Pendiente</ToggleButton>
            <ToggleButton value="finished">Finalizado</ToggleButton>
          </ToggleButtonGroup>
        </div>
        {listedMatches.length === 0 ? (
          <MessagePanel>
            {searchedMatches.length === 0
              ? 'No hay partidos de un competidor con ese nombre.'
              : 'No hay partidos en ese estado.'}
          </MessagePanel>
        ) : (
          <>
            <div className="matches">{pagedMatches.map(renderMatch)}</div>
            {paginator}
          </>
        )}
      </div>
    )
  }

  if (activeRoundNumber === null) {
    return null
  }

  const activeRound = rounds[activeRoundIndex]!

  return (
    <div className="fixture-view">
      <div className="round-selector">
        <div className="round-selector-controls">
          <IconButton
            size="small"
            disabled={activeRoundIndex === 0}
            onClick={() => {
              setSelectedRoundNumber(rounds[activeRoundIndex - 1]!.number)
              setPage(1)
            }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <span className="round-selector-label">Fecha {activeRound.number}</span>

          <IconButton
            size="small"
            disabled={activeRoundIndex === rounds.length - 1}
            onClick={() => {
              setSelectedRoundNumber(rounds[activeRoundIndex + 1]!.number)
              setPage(1)
            }}
          >
            <ChevronRightIcon />
          </IconButton>
        </div>
        {activeRound.open && <Chip size="small" color="success" variant="outlined" label="En juego" />}
      </div>
      <section className="round">
        <div className="matches">{pagedMatches.map(renderMatch)}</div>
        {paginator}
      </section>
    </div>
  )
}
