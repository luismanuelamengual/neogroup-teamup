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
import { useState } from 'react'
import CompetitorInfoModal from '@/app/(protected)/(tournaments)/components/CompetitorInfoModal'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { MatchDto } from '@/app/(protected)/(tournaments)/models/MatchDto'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { MatchType } from '@/app/(protected)/(tournaments)/models/MatchType'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { formatScore, getSeriesMatchesWon, isSeriesScore } from '@/app/(protected)/(tournaments)/utils/score'

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
  const [modalCompetitors, setModalCompetitors] = useState<CompetitorDto[]>([])
  const competitorsById = new Map((tournament.competitors ?? []).map((competitor) => [competitor.id, competitor]))
  const isInterclubs = tournament.type === TournamentType.INTERCLUBS

  if (!match) {
    return null
  }

  const homeTeam = competitorsById.get(match.homeCompetitorIds[0])
  const awayTeam = match.awayCompetitorIds ? competitorsById.get(match.awayCompetitorIds[0]) : undefined

  const sideName = (ids: number[] | null): string => {
    if (!ids || ids.length === 0) {
      return 'A definir'
    }

    return ids.map((id) => competitorsById.get(id)?.displayName ?? `#${id}`).join(' / ')
  }

  const playerName = (competitor: CompetitorDto | undefined, playerId: number): string => {
    const index = competitor?.playerIds.indexOf(playerId) ?? -1
    const player = index >= 0 ? competitor?.players?.[index] : undefined
    const name = [player?.firstName, player?.lastName].filter(Boolean).join(' ')

    return name || player?.email || `#${playerId}`
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

  const openCompetitor = (competitor: CompetitorDto | undefined) => competitor && setModalCompetitors([competitor])
  const series = isSeriesScore(match.score) ? (match.score?.matches ?? []) : []
  const seriesResult = getSeriesMatchesWon(match.score ?? {})
  /**
   * When and where the match is played, as set in the planner. Unlike the match
   * card — which only surfaces a venue that deviates from the tournament's — the
   * detail names the venue outright, resolving the "null means the tournament's
   * own site" convention so the reader never has to know about it.
   */
  const scheduleRows: { label: string; value: string }[] = [
    {
      label: 'Fecha',
      value: match.date ? dayjs(match.date).locale('es').format('dddd D [de] MMMM [de] YYYY') : 'A definir'
    },
    { label: 'Hora', value: match.hour ?? 'A definir' },
    { label: 'Sede', value: (match.siteId != null ? match.site?.name : tournament.site?.name) ?? 'A definir' },
    { label: 'Cancha', value: match.courtNumber != null ? `Cancha ${match.courtNumber}` : 'A definir' }
  ]
  const isScheduled = match.date != null || match.hour != null || match.courtNumber != null || match.siteId != null

  return (
    <>
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

          <div className="sides">
            <div
              className={`side ${match.winner === MatchSide.HOME ? 'winner' : ''}`}
              onClick={() => openCompetitor(homeTeam)}
            >
              <span className="side-label">{isInterclubs ? 'Local' : 'Lado A'}</span>
              <span className="side-name">{sideName(match.homeCompetitorIds)}</span>
            </div>
            <div className="score">
              {match.status === MatchStatus.PENDING ? '—' : formatScore(match.score, tournament.scoreFormat)}
            </div>
            <div
              className={`side away ${match.winner === MatchSide.AWAY ? 'winner' : ''}`}
              onClick={() => openCompetitor(awayTeam)}
            >
              <span className="side-label">{isInterclubs ? 'Visitante' : 'Lado B'}</span>
              <span className="side-name">{sideName(match.awayCompetitorIds)}</span>
            </div>
          </div>

          <Divider />
          <div className="schedule">
            <Typography variant="subtitle2" className="schedule-title">
              Cuándo y dónde
            </Typography>
            {isScheduled ? (
              <dl className="schedule-list">
                {scheduleRows.map(({ label, value }) => (
                  <div key={label} className="schedule-row">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Typography variant="body2" color="text.secondary">
                El partido todavía no tiene día ni horario asignado.
              </Typography>
            )}
          </div>

          {isInterclubs && series.length > 0 && (
            <>
              <Divider />
              <Typography variant="subtitle2" className="series-title">
                {`Partidos del encuentro (${seriesResult.home}-${seriesResult.away})`}
              </Typography>
              <div className="series">
                {series.map((entry, index) => (
                  <div key={index} className="series-row">
                    <Chip size="small" variant="outlined" label={entry.double ? 'Dobles' : 'Single'} />
                    <span className={`series-players ${entry.winner === MatchSide.HOME ? 'winner' : ''}`}>
                      {entry.homePlayerIds.map((id) => playerName(homeTeam, id)).join(' / ')}
                    </span>
                    <span className="series-score">{formatScore(entry.score, tournament.scoreFormat)}</span>
                    <span className={`series-players away ${entry.winner === MatchSide.AWAY ? 'winner' : ''}`}>
                      {entry.awayPlayerIds.map((id) => playerName(awayTeam, id)).join(' / ')}
                    </span>
                  </div>
                ))}
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
      <CompetitorInfoModal
        open={modalCompetitors.length > 0}
        competitors={modalCompetitors}
        onClose={() => setModalCompetitors([])}
      />
    </>
  )
}
