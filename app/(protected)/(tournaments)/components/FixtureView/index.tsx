'use client'

import './index.scss'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import { useMemo, useState } from 'react'
import MatchCard from '@/app/(protected)/(tournaments)/components/MatchCard'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { useUserStore } from '@/app/stores/users'

interface FixtureViewProps {
  tournament: TournamentDto
  category?: number
  /** Group index when rendering the group phase of a groups+playoff tournament. */
  groupNumber?: number | null
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
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
  const rounds = useMemo(() => {
    const all = tournament.rounds ?? []
    const filtered = all.filter(
      (r) =>
        (category == null || r.tournamentCategoryId === category) &&
        (r.groupNumber ?? null) === (groupNumber ?? null) &&
        (r.type === RoundType.LEAGUE || r.type === RoundType.AMERICANO)
    )

    return [...filtered].sort((a, b) => a.number - b.number)
  }, [tournament.rounds, category, groupNumber])
  const [selectedRoundId, setSelectedRoundId] = useState<number | null>(null)
  // Resolve which round to show: use selectedRoundId if valid, otherwise last round
  const activeRoundId = useMemo(() => {
    if (rounds.length === 0) {
      return null
    }

    if (selectedRoundId != null && rounds.some((r) => r.id === selectedRoundId)) {
      return selectedRoundId
    }

    return rounds[rounds.length - 1]!.id
  }, [rounds, selectedRoundId])
  const activeRoundIndex = useMemo(() => rounds.findIndex((r) => r.id === activeRoundId), [rounds, activeRoundId])
  const matchesByRound = useMemo(() => {
    const roundIds = new Set(rounds.map((r) => r.id))
    const map: Record<number, typeof tournament.matches> = {}

    for (const match of (tournament.matches ?? []).filter((m) => roundIds.has(m.roundId))) {
      if (!map[match.roundId]) {
        map[match.roundId] = []
      }

      map[match.roundId]!.push(match)
    }

    return map
  }, [rounds, tournament])
  const { editableMatchIds, highlightedMatchIds } = useMemo(() => {
    const currentOpenRoundIds = new Set(
      (tournament.rounds ?? [])
        .filter(
          (r) =>
            r.active &&
            (r.groupNumber ?? null) === (groupNumber ?? null) &&
            (category == null || r.tournamentCategoryId === category)
        )
        .map((r) => r.id)
    )

    if (currentOpenRoundIds.size === 0) {
      return { editableMatchIds: [], highlightedMatchIds: [] }
    }

    const currentOpenMatches = (tournament.matches ?? []).filter((m) => currentOpenRoundIds.has(m.roundId))

    if (organizerMode) {
      return { editableMatchIds: currentOpenMatches.map((m) => m.id), highlightedMatchIds: [] }
    }

    const userEntry = (tournament.competitors ?? []).find((c) => c.userId === userId || c.partnerUserId === userId)

    if (!userEntry) {
      return { editableMatchIds: [], highlightedMatchIds: [] }
    }

    const userMatchIds = currentOpenMatches
      .filter(
        (m) =>
          m.awayCompetitorIds !== null &&
          (m.homeCompetitorIds.includes(userEntry.id) || m.awayCompetitorIds.includes(userEntry.id))
      )
      .map((m) => m.id)

    return { editableMatchIds: userMatchIds, highlightedMatchIds: userMatchIds }
  }, [tournament, category, groupNumber, organizerMode, userId])

  if (rounds.length === 0 || activeRoundId === null) {
    return null
  }

  const activeRound = rounds[activeRoundIndex]!
  const roundMatches = (matchesByRound[activeRound.id] ?? []).slice().sort((a, b) => a.position - b.position)

  return (
    <div className="fixture-view">
      <div className="round-selector">
        <IconButton
          size="small"
          disabled={activeRoundIndex === 0}
          onClick={() => setSelectedRoundId(rounds[activeRoundIndex - 1]!.id)}
        >
          <ChevronLeftIcon />
        </IconButton>
        <span className="round-selector-label">Fecha {activeRound.number}</span>
        <IconButton
          size="small"
          disabled={activeRoundIndex === rounds.length - 1}
          onClick={() => setSelectedRoundId(rounds[activeRoundIndex + 1]!.id)}
        >
          <ChevronRightIcon />
        </IconButton>
      </div>
      <section className="round">
        <header className="round-header">
          {activeRound.status === RoundStatus.OPEN && (
            <Chip size="small" color="success" variant="outlined" label="En juego" />
          )}
        </header>
        <div className="matches">
          {roundMatches.map((match) => (
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
