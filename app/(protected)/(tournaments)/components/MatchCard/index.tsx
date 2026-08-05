'use client'

import 'dayjs/locale/es'
import './index.scss'
import EditIcon from '@mui/icons-material/Edit'
import IconButton from '@mui/material/IconButton'
import dayjs from 'dayjs'
import { useState } from 'react'
import MatchInfoModal from '@/app/(protected)/(tournaments)/components/MatchInfoModal'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { MatchSide, MatchSideNames } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { hasMatchSchedule } from '@/app/(protected)/(tournaments)/utils/matches'
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
  const [detailOpen, setDetailOpen] = useState(false)
  const competitorsById: Record<number, CompetitorDto> = Object.fromEntries(
    (tournament.competitors ?? []).map((c) => [c.id, c])
  )
  const scoreFormat = tournament.scoreFormat
  const isVoid = match.status === MatchStatus.VOID
  // A bye's away side is structurally absent (never gets an opponent), unlike a
  // "to be defined" bracket placeholder — which is also null but still PENDING.
  const isBye = match.awayCompetitorId === null && match.status !== MatchStatus.PENDING && !isVoid
  const winner: MatchSide | null = match.winner
  // A placeholder ("to be defined") slot has nothing worth opening.
  const hasDetail = !isVoid && match.homeCompetitorId != null
  // The venue is only worth naming when the match deviates from the tournament's
  // own site — otherwise it is the default everyone already assumes.
  const otherSite = match.siteId != null && match.siteId !== tournament.siteId ? (match.site ?? null) : null
  // The schedule header is skipped entirely for a match nobody has planned yet.
  const hasSchedule = hasMatchSchedule(match, tournament.siteId)

  const competitorLabel = (competitor: CompetitorDto | undefined, id: number): string => {
    if (!competitor) {
      return `#${id}`
    }

    const seed = competitor.seedNumber

    return seed != null ? `[${seed}] ${competitor.shortName}` : competitor.shortName
  }

  const sideName = (id: number | null): string => {
    if (id == null) {
      return '—'
    }

    return competitorLabel(competitorsById[id], id)
  }

  const renderSide = (side: MatchSide, id: number | null) => (
    <div className={`side ${winner === side ? 'winner' : ''} ${winner && winner !== side ? 'loser' : ''}`}>
      <span className={`side-dot ${MatchSideNames[side]}`} />
      <span className="side-name">{sideName(id)}</span>
    </div>
  )

  return (
    <>
      {/* The whole card opens the match detail — which is also where each
          competitor's own info is reachable from. */}
      <div
        className={`match-card ${highlighted ? 'highlighted' : ''} ${hasDetail ? 'clickable' : ''}`}
        onClick={() => hasDetail && setDetailOpen(true)}
      >
        {/* When and where the match is played, as set in the planner. The court
            number is deliberately left out: it only means something to whoever
            is standing at the venue, and the planner already shows it. */}
        {hasSchedule && (
          <div className="match-card-schedule">
            {match.date && <span className="date">{dayjs(match.date).locale('es').format('ddd D MMM')}</span>}
            {match.hour && <span className="hour">{match.hour}</span>}
            {otherSite && <span className="site">{otherSite.name}</span>}
          </div>
        )}
        <div className="match-card-main">
          {isVoid ? (
            <div className="sides">
              <div className="bye">Sin clasificado</div>
            </div>
          ) : (
            <div className="sides">
              {renderSide(MatchSide.HOME, match.homeCompetitorId)}
              {isBye ? <div className="bye">Pasa de ronda</div> : renderSide(MatchSide.AWAY, match.awayCompetitorId)}
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
              <IconButton
                size="small"
                className="edit"
                onClick={(event) => {
                  // Loading a result is a different intent than inspecting one.
                  event.stopPropagation()
                  onEdit?.(match)
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            )}
          </div>
        </div>
      </div>
      <MatchInfoModal open={detailOpen} tournament={tournament} match={match} onClose={() => setDetailOpen(false)} />
    </>
  )
}
