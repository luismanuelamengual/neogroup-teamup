'use client'

import './index.scss'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { useUserStore } from '@/app/(auth)/stores/users'
import MatchCard from '@/app/(tournaments)/components/MatchCard'
import { MatchDto } from '@/app/(tournaments)/models/MatchDto'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'

interface BracketViewProps {
  tournament: TournamentDto
  category?: string
  organizerMode?: boolean
  onEditMatch?: (match: MatchDto) => void
}

/** Horizontal playoff bracket: one column per round. */
export default function BracketView({ tournament, category, organizerMode = false, onEditMatch }: BracketViewProps) {
  const userId = useUserStore((state) => state.user?.id ?? null)
  const t = useTranslations('tournaments')
  const competitorNames = useMemo(() => {
    const names: Record<number, string> = {}

    for (const competitor of tournament.competitors ?? []) {
      names[competitor.id] = competitor.displayName
    }

    return names
  }, [tournament.competitors])
  const rounds = useMemo(() => {
    const all = tournament.rounds ?? []
    const filtered = category != null ? all.filter((r) => (r.category ?? null) === category) : all

    return [...filtered].sort((a, b) => a.number - b.number)
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
    <div className="bracket-view">
      <div className="scroller">
        {rounds.map((round) => {
          const roundMatches = (matchesByRound[round.id] ?? []).slice().sort((a, b) => a.position - b.position)

          return (
            <div key={round.id} className="column">
              <h3 className="round-title">{t('playoffRound', { number: round.number })}</h3>
              <div className="matches">
                {roundMatches.map((match) => (
                  <div key={match.id} className="match">
                    <MatchCard
                      match={match}
                      competitorNames={competitorNames}
                      scoreFormat={tournament.scoreFormat}
                      highlighted={highlightedMatchIds.includes(match.id)}
                      editable={editableMatchIds.includes(match.id)}
                      onEdit={onEditMatch}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
