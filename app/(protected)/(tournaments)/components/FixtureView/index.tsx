'use client'

import './index.scss'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import { useMemo, useState } from 'react'
import MatchCard from '@/app/(protected)/(tournaments)/components/MatchCard'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { isMatchEditable } from '@/app/(protected)/(tournaments)/utils/matches'
import { useUserStore } from '@/app/stores/users'

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
  // Matches of the round-robin (LEAGUE) lane for the requested category/group.
  const laneMatches = useMemo(
    () =>
      (tournament.matches ?? []).filter(
        (m) =>
          (category == null || m.tournamentCategoryId === category) &&
          (m.groupNumber ?? null) === (groupNumber ?? null) &&
          m.type === MatchType.LEAGUE
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
    const editable = laneMatches.filter((m) => isMatchEditable(m, categoryMatches, tournament.type, tournament.status))

    if (organizerMode) {
      return { editableMatchIds: editable.map((m) => m.id), highlightedMatchIds: [] as number[] }
    }

    const userEntry = (tournament.competitors ?? []).find((c) => userId != null && c.playerIds.includes(userId))

    if (!userEntry) {
      return { editableMatchIds: [] as number[], highlightedMatchIds: [] as number[] }
    }

    const userMatchIds = editable
      .filter(
        (m) =>
          m.awayCompetitorIds !== null &&
          (m.homeCompetitorIds.includes(userEntry.id) || m.awayCompetitorIds.includes(userEntry.id))
      )
      .map((m) => m.id)

    return { editableMatchIds: userMatchIds, highlightedMatchIds: userMatchIds }
  }, [tournament, laneMatches, category, organizerMode, userId])

  if (rounds.length === 0 || activeRoundNumber === null) {
    return null
  }

  const activeRound = rounds[activeRoundIndex]!

  return (
    <div className="fixture-view">
      <div className="round-selector">
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
      <section className="round">
        <header className="round-header">
          {activeRound.open && <Chip size="small" color="success" variant="outlined" label="En juego" />}
        </header>
        <div className="matches">
          {activeRound.matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              tournament={tournament}
              highlighted={highlightedMatchIds.includes(match.id)}
              editable={editableMatchIds.includes(match.id)}
              onEdit={onEditMatch}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
