'use client'

import './index.scss'
import Chip from '@mui/material/Chip'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { useUserStore } from '@/app/(auth)/stores/users'
import MatchCard from '@/app/(protected)/(tournaments)/components/MatchCard'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

interface FixtureViewProps {
  tournament: TournamentDto
  category?: string
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
}

/** Rounds + matches list used by leagues and americano tournaments. */
export default function FixtureView({ tournament, category, organizerMode = false, onEditMatch }: FixtureViewProps) {
  const userId = useUserStore((state) => state.user?.id ?? null)
  const t = useTranslations('tournaments')
  const rounds = useMemo(() => {
    const all = tournament.rounds ?? []
    const filtered = category != null ? all.filter((r) => (r.category ?? null) === category) : all

    return [...filtered].sort((a, b) => b.number - a.number)
  }, [tournament.rounds, category])
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
            r.number === tournament.currentRound &&
            r.status === RoundStatus.OPEN &&
            (category == null || (r.category ?? null) === category)
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
  }, [tournament, category, organizerMode, userId])

  return (
    <div className="fixture-view">
      {rounds.map((round) => {
        const roundMatches = (matchesByRound[round.id] ?? []).slice().sort((a, b) => a.position - b.position)

        return (
          <section key={round.id} className="round">
            <header className="round-header">
              <h3 className="round-title">
                {t(tournament.type === TournamentType.LEAGUE ? 'round' : 'playoffRound', { number: round.number })}
              </h3>
              {round.status === RoundStatus.OPEN && (
                <Chip size="small" color="success" variant="outlined" label={t('status.ongoing')} />
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
        )
      })}
    </div>
  )
}
