'use client'

import './index.scss'
import EditIcon from '@mui/icons-material/Edit'
import IconButton from '@mui/material/IconButton'
import { useTranslations } from 'next-intl'
import { MatchSide, MatchSideNames } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { formatScore } from '@/app/(protected)/(tournaments)/utils/score'
import { MatchDto } from '../../models/MatchDto'
import { TournamentDto } from '../../models/TournamentDto'

interface MatchCardProps {
  tournament: TournamentDto
  match: MatchDto
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
  tournament,
  highlighted = false,
  editable = false,
  onEdit
}: MatchCardProps) {
  const t = useTranslations('tournaments')
  const competitorNames: Record<number, string> = Object.fromEntries(
    (tournament.competitors ?? []).map((c) => [c.id, c.displayName])
  )
  const scoreFormat = tournament.scoreFormat
  const isBye = match.awayCompetitorIds === null
  const winner: MatchSide | null = match.winner
  const renderSide = (side: MatchSide, ids: number[] | null) => (
    <div className={`side ${winner === side ? 'winner' : ''} ${winner && winner !== side ? 'loser' : ''}`}>
      <span className={`side-dot ${MatchSideNames[side]}`} />
      <span className="side-name">{sideName(ids, competitorNames)}</span>
    </div>
  )

  return (
    <div className={`match-card ${highlighted ? 'highlighted' : ''}`}>
      <div className="sides">
        {renderSide(MatchSide.HOME, match.homeCompetitorIds)}
        {isBye ? <div className="bye">{t('bye')}</div> : renderSide(MatchSide.AWAY, match.awayCompetitorIds)}
      </div>
      <div className="result">
        {!isBye &&
          (match.status === MatchStatus.PENDING ? (
            <span className="pending">{t('pendingResult')}</span>
          ) : (
            <span className="score">{formatScore(match.score, scoreFormat)}</span>
          ))}
        {editable && !isBye && (
          <IconButton size="small" className="edit" onClick={() => onEdit?.(match)}>
            <EditIcon fontSize="small" />
          </IconButton>
        )}
      </div>
    </div>
  )
}
