'use client'

import './index.scss'
import { useTranslations } from 'next-intl'
import MatchCard from '@/app/(tournaments)/components/MatchCard'
import { MatchDto, RoundDto } from '@/app/(tournaments)/models/dtos'
import { ScoreFormat } from '@/app/(tournaments)/models/types'

interface BracketViewProps {
  rounds: RoundDto[]
  matches: MatchDto[]
  competitorNames: Record<number, string>
  scoreFormat: ScoreFormat
  highlightedMatchIds?: number[]
  editableMatchIds?: number[]
  onEditMatch?: (match: MatchDto) => void
}

/** Horizontal playoff bracket: one column per round. */
export default function BracketView({
  rounds,
  matches,
  competitorNames,
  scoreFormat,
  highlightedMatchIds = [],
  editableMatchIds = [],
  onEditMatch
}: BracketViewProps) {
  const t = useTranslations('tournaments')
  const sortedRounds = [...rounds].sort((a, b) => a.number - b.number)

  return (
    <div className="bracket-view">
      <div className="bracket-view__scroller">
        {sortedRounds.map((round) => {
          const roundMatches = matches
            .filter((match) => match.roundId === round.id)
            .sort((a, b) => a.position - b.position)

          return (
            <div key={round.id} className="bracket-view__column">
              <h3 className="bracket-view__round-title">{t('playoffRound', { number: round.number })}</h3>
              <div className="bracket-view__matches">
                {roundMatches.map((match) => (
                  <div key={match.id} className="bracket-view__match">
                    <MatchCard
                      match={match}
                      competitorNames={competitorNames}
                      scoreFormat={scoreFormat}
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
