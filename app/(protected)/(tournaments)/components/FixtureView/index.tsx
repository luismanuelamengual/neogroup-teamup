'use client'

import './index.scss'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
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

  // No round selector and no "En juego" chip: with nothing in play there is
  // nothing to navigate between, so the whole schedule is one list and any card
  // can take its result. That list can get long (a 10-competitor league is 45
  // matches), hence the search box.
  if (unordered) {
    return (
      <div className="fixture-view">
        <TextField
          size="small"
          placeholder="Buscar por competidor"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
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
        {searchedMatches.length === 0 ? (
          <MessagePanel>No hay partidos de un competidor con ese nombre.</MessagePanel>
        ) : (
          <div className="matches">{searchedMatches.map(renderMatch)}</div>
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
            onClick={() => setSelectedRoundNumber(rounds[activeRoundIndex - 1]!.number)}
          >
            <ChevronLeftIcon />
          </IconButton>
          <span className="round-selector-label">Fecha {activeRound.number}</span>

          <IconButton
            size="small"
            disabled={activeRoundIndex === rounds.length - 1}
            onClick={() => setSelectedRoundNumber(rounds[activeRoundIndex + 1]!.number)}
          >
            <ChevronRightIcon />
          </IconButton>
        </div>
        {activeRound.open && <Chip size="small" color="success" variant="outlined" label="En juego" />}
      </div>
      <section className="round">
        <div className="matches">{activeRound.matches.map(renderMatch)}</div>
      </section>
    </div>
  )
}
