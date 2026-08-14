'use client'

import 'dayjs/locale/es'
import './index.scss'
import EditIcon from '@mui/icons-material/Edit'
import IconButton from '@mui/material/IconButton'
import dayjs from 'dayjs'
import { Fragment, useState } from 'react'
import MatchInfoModal from '@/app/(protected)/(tournaments)/components/MatchInfoModal'
import SuperTiebreakValue from '@/app/(protected)/(tournaments)/components/SuperTiebreakValue'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { MatchSide, MatchSideNames } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { getCompetitorNameLines } from '@/app/(protected)/(tournaments)/utils/competitors'
import { hasMatchSchedule } from '@/app/(protected)/(tournaments)/utils/matches'
import { formatScore, getScoreColumns } from '@/app/(protected)/(tournaments)/utils/score'
import { MatchDto } from '../../models/MatchDto'
import { TournamentDto } from '../../models/TournamentDto'

interface MatchCardProps {
  tournament: TournamentDto
  match: MatchDto
  highlighted?: boolean
  editable?: boolean
  onEdit?: (match: MatchDto) => void
}

const HOME_ROW = 1
const AWAY_ROW = 2

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
  // Per-side score columns (one column per set for a sets score, a single
  // column for a basic count or an interclubes series) — the same shape for
  // every score format, so a match card never falls back to a
  // format-specific "old counter" style. Null falls back to a plain status
  // note in `.result` (walkover, or not played yet).
  const scoreColumns = getScoreColumns(match.score, scoreFormat)

  const nameLines = (id: number | null): string[] => {
    if (id == null) {
      return ['—']
    }

    return getCompetitorNameLines(competitorsById[id], id)
  }

  const renderSide = (side: MatchSide, id: number | null, row: number) => (
    <div
      className={`side ${winner === side ? 'winner' : ''} ${winner && winner !== side ? 'loser' : ''}`}
      style={{ gridColumn: 1, gridRow: row }}
    >
      <span className={`side-dot ${MatchSideNames[side]}`} />
      <div className="side-name">
        {nameLines(id).map((line, index) => (
          <span key={index}>{line}</span>
        ))}
      </div>
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
          {/* Names and score share ONE grid — home is row 1, away is row 2 — rather
              than being laid out in separate boxes. That is what makes both
              alignments hold at once: a set's home/away cells sit in the same grid
              column, so the column is exactly as wide as that set's longest value
              (a super tiebreak's "10" no longer drifts from a "6" above it), and a
              side's own cells sit in the same grid row as its name, so a doubles
              name wrapping to two lines pushes its own score down with it instead
              of leaving the two out of sync. */}
          <div className="match-card-board">
            {isVoid ? (
              <div className="bye" style={{ gridColumn: 1, gridRow: `${HOME_ROW} / span 2` }}>
                Sin clasificado
              </div>
            ) : (
              <>
                {renderSide(MatchSide.HOME, match.homeCompetitorId, HOME_ROW)}
                {isBye ? (
                  <div className="bye" style={{ gridColumn: 1, gridRow: AWAY_ROW }}>
                    Pasa de ronda
                  </div>
                ) : (
                  renderSide(MatchSide.AWAY, match.awayCompetitorId, AWAY_ROW)
                )}
                {!isBye &&
                  scoreColumns?.map((column, index) => (
                    <Fragment key={index}>
                      <span
                        className={`score-cell ${column.home > column.away ? 'won' : ''}`}
                        style={{ gridColumn: index + 2, gridRow: HOME_ROW }}
                      >
                        {column.superTiebreak ? <SuperTiebreakValue value={column.home} /> : column.home}
                      </span>
                      <span
                        className={`score-cell ${column.away > column.home ? 'won' : ''}`}
                        style={{ gridColumn: index + 2, gridRow: AWAY_ROW }}
                      >
                        {column.superTiebreak ? <SuperTiebreakValue value={column.away} /> : column.away}
                      </span>
                    </Fragment>
                  ))}
              </>
            )}
          </div>
          {!isBye && !isVoid && (!scoreColumns || editable) && (
            <div className="result">
              {!scoreColumns && (
                // Nothing numeric to show per side yet — a walkover has no
                // per-side score, only a winning side, and an unplayed match has
                // none at all. Both read as the same kind of status note rather
                // than the old bold score pill, so "Pendiente" and "W.O." look
                // like the same family of message.
                <span className="note">
                  {match.status === MatchStatus.PENDING ? 'Pendiente' : formatScore(match.score, scoreFormat)}
                </span>
              )}
              {editable && (
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
          )}
        </div>
      </div>
      <MatchInfoModal open={detailOpen} tournament={tournament} match={match} onClose={() => setDetailOpen(false)} />
    </>
  )
}
