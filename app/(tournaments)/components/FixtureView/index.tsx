'use client'

import './index.scss'
import Chip from '@mui/material/Chip'
import { useTranslations } from 'next-intl'
import MatchCard from '@/app/(tournaments)/components/MatchCard'
import { MatchDto } from '@/app/(tournaments)/models/MatchDto'
import { RoundDto } from '@/app/(tournaments)/models/RoundDto'
import { RoundStatus } from '@/app/(tournaments)/models/RoundStatus'
import { ScoreFormat } from '@/app/(tournaments)/models/ScoreFormat'
import { TournamentType } from '@/app/(tournaments)/models/TournamentType'

interface FixtureViewProps {
  type: TournamentType
  rounds: RoundDto[]
  matches: MatchDto[]
  competitorNames: Record<number, string>
  scoreFormat: ScoreFormat
  highlightedMatchIds?: number[]
  editableMatchIds?: number[]
  onEditMatch?: (match: MatchDto) => void
}

/** Rounds + matches list used by leagues and americano tournaments. */
export default function FixtureView({
  type,
  rounds,
  matches,
  competitorNames,
  scoreFormat,
  highlightedMatchIds = [],
  editableMatchIds = [],
  onEditMatch
}: FixtureViewProps) {
  const t = useTranslations('tournaments')
  const sortedRounds = [...rounds].sort((a, b) => b.number - a.number)

  return (
    <div className="fixture-view">
      {sortedRounds.map((round) => {
        const roundMatches = matches
          .filter((match) => match.roundId === round.id)
          .sort((a, b) => a.position - b.position)

        return (
          <section key={round.id} className="round">
            <header className="round-header">
              <h3 className="round-title">
                {t(type === TournamentType.LEAGUE ? 'round' : 'playoffRound', { number: round.number })}
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
                  competitorNames={competitorNames}
                  scoreFormat={scoreFormat}
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
