'use client'

import './index.scss'
import EditIcon from '@mui/icons-material/Edit'
import IconButton from '@mui/material/IconButton'
import { useState } from 'react'
import CompetitorInfoModal from '@/app/(protected)/(tournaments)/components/CompetitorInfoModal'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
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

export default function MatchCard({
  match,
  tournament,
  highlighted = false,
  editable = false,
  onEdit
}: MatchCardProps) {
  const [modalCompetitors, setModalCompetitors] = useState<CompetitorDto[]>([])
  const competitorsById: Record<number, CompetitorDto> = Object.fromEntries(
    (tournament.competitors ?? []).map((c) => [c.id, c])
  )
  const scoreFormat = tournament.scoreFormat
  const isVoid = match.status === MatchStatus.VOID
  const isBye = match.awayCompetitorIds === null && !isVoid
  const winner: MatchSide | null = match.winner

  const handleSideClick = (ids: number[] | null) => {
    if (!ids || ids.length === 0) {
      return
    }

    const found = ids.map((id) => competitorsById[id]).filter(Boolean) as CompetitorDto[]

    if (found.length > 0) {
      setModalCompetitors(found)
    }
  }

  const competitorLabel = (competitor: CompetitorDto | undefined, id: number): string => {
    if (!competitor) {
      return `#${id}`
    }

    const seed = competitor.seedNumber

    return seed != null ? `[${seed}] ${competitor.shortName}` : competitor.shortName
  }

  const sideName = (ids: number[] | null): string => {
    if (!ids || ids.length === 0) {
      return '—'
    }

    return ids.map((id) => competitorLabel(competitorsById[id], id)).join(' / ')
  }

  const renderSide = (side: MatchSide, ids: number[] | null) => (
    <div className={`side ${winner === side ? 'winner' : ''} ${winner && winner !== side ? 'loser' : ''}`}>
      <span className={`side-dot ${MatchSideNames[side]}`} />
      <span className="side-name clickable" onClick={() => handleSideClick(ids)}>
        {sideName(ids)}
      </span>
    </div>
  )

  return (
    <>
      <div className={`match-card ${highlighted ? 'highlighted' : ''}`}>
        {isVoid ? (
          <div className="sides">
            <div className="bye">Sin clasificado</div>
          </div>
        ) : (
          <div className="sides">
            {renderSide(MatchSide.HOME, match.homeCompetitorIds)}
            {isBye ? <div className="bye">Pasa de ronda</div> : renderSide(MatchSide.AWAY, match.awayCompetitorIds)}
          </div>
        )}
        <div className="result">
          {!isBye &&
            !isVoid &&
            (match.status === MatchStatus.PENDING ? (
              <span className="pending">Pendiente</span>
            ) : (
              <span className="score">{formatScore(match.score, scoreFormat)}</span>
            ))}
          {editable && !isBye && !isVoid && (
            <IconButton size="small" className="edit" onClick={() => onEdit?.(match)}>
              <EditIcon fontSize="small" />
            </IconButton>
          )}
        </div>
      </div>
      <CompetitorInfoModal
        open={modalCompetitors.length > 0}
        competitors={modalCompetitors}
        onClose={() => setModalCompetitors([])}
      />
    </>
  )
}
