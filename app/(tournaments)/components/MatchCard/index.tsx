'use client'

import './index.scss'
import EditIcon from '@mui/icons-material/Edit'
import IconButton from '@mui/material/IconButton'
import { useTranslations } from 'next-intl'
import { MatchDto } from '@/app/(tournaments)/models/Match'
import { MatchSide } from '@/app/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(tournaments)/models/MatchStatus'
import { ScoreFormat } from '@/app/(tournaments)/models/ScoreFormat'
import { MATCH_SIDE_KEYS } from '@/app/(tournaments)/utils/labels'
import { formatScore } from '@/app/(tournaments)/utils/score'

interface MatchCardProps {
  match: MatchDto
  competitorNames: Record<number, string>
  scoreFormat: ScoreFormat
  highlighted?: boolean
  editable?: boolean
  onEdit?: (match: MatchDto) => void
}

function sideName(ids: number[] | null, names: Record<number, string>): string {
  if (!ids || ids.length === 0) {
    return '—'
  }

  return ids.map((id) => names[id] ?? `#${id}`).join(' / ')
}

export default function MatchCard({
  match,
  competitorNames,
  scoreFormat,
  highlighted = false,
  editable = false,
  onEdit
}: MatchCardProps) {
  const t = useTranslations('tournaments')
  const isBye = match.awayCompetitorIds === null
  const winner: MatchSide | null = match.winner
  const renderSide = (side: MatchSide, ids: number[] | null) => (
    <div
      className={`match-card__side ${winner === side ? 'match-card__side--winner' : ''} ${
        winner && winner !== side ? 'match-card__side--loser' : ''
      }`}
    >
      <span className={`match-card__side-dot match-card__side-dot--${MATCH_SIDE_KEYS[side]}`} />
      <span className="match-card__side-name">{sideName(ids, competitorNames)}</span>
    </div>
  )

  return (
    <div className={`match-card ${highlighted ? 'match-card--highlighted' : ''}`}>
      <div className="match-card__sides">
        {renderSide(MatchSide.HOME, match.homeCompetitorIds)}
        {isBye ? (
          <div className="match-card__bye">{t('bye')}</div>
        ) : (
          renderSide(MatchSide.AWAY, match.awayCompetitorIds)
        )}
      </div>
      <div className="match-card__result">
        {!isBye &&
          (match.status === MatchStatus.PENDING ? (
            <span className="match-card__pending">{t('pendingResult')}</span>
          ) : (
            <span className="match-card__score">{formatScore(match.score, scoreFormat)}</span>
          ))}
        {editable && !isBye && (
          <IconButton size="small" className="match-card__edit" onClick={() => onEdit?.(match)}>
            <EditIcon fontSize="small" />
          </IconButton>
        )}
      </div>
    </div>
  )
}
