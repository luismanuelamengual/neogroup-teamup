'use client'

import './index.scss'
import 'dayjs/locale/es'
import CloseIcon from '@mui/icons-material/Close'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import dayjs from 'dayjs'
import { Fragment, useEffect, useState } from 'react'
import { useSites } from '@/app/(protected)/(sites)/hooks/useSites'
import SuperTiebreakValue from '@/app/(protected)/(tournaments)/components/SuperTiebreakValue'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  formatScore,
  getScoreColumns,
  getSeriesMatchesWon,
  isSeriesScore
} from '@/app/(protected)/(tournaments)/utils/score'

/** Spanish name of a knockout stage, from its distance to the final. */
const BRACKET_INSTANCE_NAMES: Record<number, string> = {
  1: 'Final',
  2: 'Semifinal',
  3: 'Cuartos de final',
  4: 'Octavos de final',
  5: 'Dieciseisavos de final'
}

interface MatchInfoModalProps {
  open: boolean
  tournament: TournamentDto
  match: MatchDto | null
  onClose: () => void
}

/**
 * Detail of a single match: who plays, in what stage, and how it ended.
 *
 * For interclubes it shows more than the scoreline, because the scoreline is
 * only a summary: an encounter is three individual matches, and the interesting
 * part is which players took the court in each of them and how those went.
 */
export default function MatchInfoModal({ open, tournament, match, onClose }: MatchInfoModalProps) {
  const { getAllSites } = useSites()
  const [siteNames, setSiteNames] = useState<Record<number, string>>({})
  const competitorsById = new Map((tournament.competitors ?? []).map((competitor) => [competitor.id, competitor]))
  const isInterclubs = tournament.type === TournamentType.INTERCLUBS

  // Venue catalogue, needed only by interclubes: an encounter without a venue of
  // its own is played at the home team's, and the team carries just the site id
  // (`data.siteId`) — there is no eager-loaded site to read the name off. Every
  // other type resolves the fallback from the tournament, which comes resolved.
  useEffect(() => {
    if (!open || !isInterclubs) {
      return
    }

    let cancelled = false

    getAllSites()
      .then((sites) => {
        if (!cancelled) {
          setSiteNames(Object.fromEntries(sites.map((site) => [site.id, site.name])))
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [open, isInterclubs, getAllSites])

  if (!match) {
    return null
  }

  const homeTeam = match.homeCompetitorId != null ? competitorsById.get(match.homeCompetitorId) : undefined
  const awayTeam = match.awayCompetitorId != null ? competitorsById.get(match.awayCompetitorId) : undefined

  const sideName = (id: number | null): string => {
    if (id == null) {
      return 'A definir'
    }

    return competitorsById.get(id)?.displayName ?? `#${id}`
  }

  const playerName = (competitor: CompetitorDto | undefined, playerId: number): string => {
    const index = competitor?.playerIds.indexOf(playerId) ?? -1
    const player = index >= 0 ? competitor?.players?.[index] : undefined

    return player?.displayName || `#${playerId}`
  }

  const stageName = (): string => {
    if (match.type === MatchType.BRACKET || match.type === MatchType.CONSOLATION_BRACKET) {
      const stage = match.bracketInstance ? BRACKET_INSTANCE_NAMES[match.bracketInstance] : null
      const prefix = match.type === MatchType.CONSOLATION_BRACKET ? 'Consuelo · ' : ''

      return `${prefix}${stage ?? `Ronda ${match.roundNumber}`}`
    }

    if (match.groupNumber != null) {
      return `Zona ${match.groupNumber + 1} · Fecha ${match.roundNumber}`
    }

    return `Fecha ${match.roundNumber}`
  }

  const series = isSeriesScore(match.score) ? (match.score?.matches ?? []) : []
  const seriesResult = getSeriesMatchesWon(match.score ?? {})
  // Same per-side column shape MatchCard renders from (one column per set, a
  // single column for a basic count or an interclubes series) — null falls
  // back to a single centered note (walkover, or not played yet).
  const scoreColumns = getScoreColumns(match.score, tournament.scoreFormat)
  // A super tiebreak is always the 3rd (last) set, and its score renders as a
  // superscript pinned outside the flow to the "0"'s upper-right corner (see
  // SuperTiebreakValue) — the grid's own max-content column sizing never
  // accounts for it. When it lands on the LAST column there's no next column
  // to visually share the overflow with, so without reserved room it spills
  // straight past the board into the dialog's own padding. See `.has-super-tiebreak`.
  const scoreEndsInSuperTiebreak = scoreColumns?.some((column) => column.superTiebreak) ?? false
  /**
   * Venue of the match, resolving the "null means somewhere else" convention so
   * the reader never has to know about it: the match's own venue first, and when
   * it has none the tournament's — except in interclubes, where an encounter is
   * hosted by the home team, so its venue is the fallback instead.
   */
  const homeSiteId = homeTeam?.data?.siteId ?? null
  const fallbackSiteName = isInterclubs
    ? homeSiteId != null
      ? siteNames[homeSiteId]
      : undefined
    : tournament.site?.name
  /** When and where the match is played, as set in the planner. */
  const scheduleRows: { label: string; value: string }[] = [
    {
      label: 'Fecha',
      value: match.date ? dayjs(match.date).locale('es').format('dddd D [de] MMMM [de] YYYY') : 'A definir'
    },
    { label: 'Hora', value: match.hour ?? 'A definir' },
    { label: 'Sede', value: match.site?.name ?? fallbackSiteName ?? 'A definir' },
    { label: 'Cancha', value: match.courtNumber != null ? `Cancha ${match.courtNumber}` : 'A definir' }
  ]

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth className="match-info-modal">
      <DialogTitle className="match-info-modal-title">
        Detalle del partido
        <IconButton size="small" onClick={onClose} className="close-btn" aria-label="Cerrar">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent className="match-info-modal-content">
        <div className="stage">
          <Chip size="small" label={stageName()} />
          {match.status === MatchStatus.PENDING && <Chip size="small" variant="outlined" label="Pendiente" />}
          {match.status === MatchStatus.WALKOVER && <Chip size="small" color="warning" label="W.O." />}
        </div>

        <div className="schedule">
          <Typography variant="subtitle2" className="schedule-title">
            Cuándo y dónde
          </Typography>
          <dl className="schedule-list">
            {scheduleRows.map(({ label, value }) => (
              <div key={label} className="schedule-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Divider />

        {/* Same board as MatchCard: home is row 1, away is row 2, and a set's
            home/away cells share one grid column — so the column sizes itself
            to whichever value is widest instead of a fixed width that a
            double-digit super tiebreak could outgrow. */}
        <div className={`score-board ${scoreEndsInSuperTiebreak ? 'has-super-tiebreak' : ''}`}>
          <div className={`side ${match.winner === MatchSide.HOME ? 'winner' : ''}`} style={{ gridRow: 1 }}>
            <span className="side-label">{isInterclubs ? 'Local' : 'Lado A'}</span>
            <span className="side-name">{sideName(match.homeCompetitorId)}</span>
          </div>
          <div className={`side ${match.winner === MatchSide.AWAY ? 'winner' : ''}`} style={{ gridRow: 2 }}>
            <span className="side-label">{isInterclubs ? 'Visitante' : 'Lado B'}</span>
            <span className="side-name">{sideName(match.awayCompetitorId)}</span>
          </div>
          {scoreColumns ? (
            scoreColumns.map((column, index) => (
              <Fragment key={index}>
                <span
                  className={`score-cell ${column.home > column.away ? 'won' : ''}`}
                  style={{ gridColumn: index + 2, gridRow: 1 }}
                >
                  {column.superTiebreak ? <SuperTiebreakValue value={column.home} /> : column.home}
                </span>
                <span
                  className={`score-cell ${column.away > column.home ? 'won' : ''}`}
                  style={{ gridColumn: index + 2, gridRow: 2 }}
                >
                  {column.superTiebreak ? <SuperTiebreakValue value={column.away} /> : column.away}
                </span>
              </Fragment>
            ))
          ) : (
            <span className="score-note" style={{ gridColumn: 2, gridRow: '1 / span 2' }}>
              {match.status === MatchStatus.PENDING ? '—' : formatScore(match.score, tournament.scoreFormat)}
            </span>
          )}
        </div>

        {isInterclubs && series.length > 0 && (
          <>
            <Divider />
            <Typography variant="subtitle2" className="series-title">
              {`Partidos del encuentro (${seriesResult.home}-${seriesResult.away})`}
            </Typography>
            <div className="series">
              {series.map((entry, index) => {
                const entryColumns = getScoreColumns(entry.score, tournament.scoreFormat)
                const entryEndsInSuperTiebreak = entryColumns?.some((column) => column.superTiebreak) ?? false

                return (
                  <div key={index} className="series-row">
                    <Chip size="small" variant="outlined" label={entry.double ? 'Dobles' : 'Single'} />
                    <div className={`series-board ${entryEndsInSuperTiebreak ? 'has-super-tiebreak' : ''}`}>
                      <span
                        className={`series-players ${entry.winner === MatchSide.HOME ? 'winner' : ''}`}
                        style={{ gridRow: 1 }}
                      >
                        {entry.homePlayerIds.map((id) => playerName(homeTeam, id)).join(' / ')}
                      </span>
                      <span
                        className={`series-players ${entry.winner === MatchSide.AWAY ? 'winner' : ''}`}
                        style={{ gridRow: 2 }}
                      >
                        {entry.awayPlayerIds.map((id) => playerName(awayTeam, id)).join(' / ')}
                      </span>
                      {entryColumns ? (
                        entryColumns.map((column, i) => (
                          <Fragment key={i}>
                            <span
                              className={`series-score-cell ${column.home > column.away ? 'won' : ''}`}
                              style={{ gridColumn: i + 2, gridRow: 1 }}
                            >
                              {column.superTiebreak ? <SuperTiebreakValue value={column.home} /> : column.home}
                            </span>
                            <span
                              className={`series-score-cell ${column.away > column.home ? 'won' : ''}`}
                              style={{ gridColumn: i + 2, gridRow: 2 }}
                            >
                              {column.superTiebreak ? <SuperTiebreakValue value={column.away} /> : column.away}
                            </span>
                          </Fragment>
                        ))
                      ) : (
                        <span className="series-score-note" style={{ gridColumn: 2, gridRow: '1 / span 2' }}>
                          {formatScore(entry.score, tournament.scoreFormat)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {isInterclubs && series.length === 0 && match.status !== MatchStatus.PENDING && (
          <Typography variant="body2" color="text.secondary">
            El encuentro se resolvió sin jugarse.
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  )
}
