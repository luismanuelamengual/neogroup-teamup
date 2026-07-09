'use client'

import './index.scss'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { useMemo, useState } from 'react'
import CompetitorInfoModal from '@/app/(protected)/(tournaments)/components/CompetitorInfoModal'
import { DEFAULT_AMERICANO_SETTINGS } from '@/app/(protected)/(tournaments)/models/AmericanoSettings'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { DEFAULT_LEAGUE_SETTINGS } from '@/app/(protected)/(tournaments)/models/LeagueSettings'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'

function formatPoints(value: number, label: string): string | null {
  if (!value) {
    return null
  }

  return `${value} pto${value === 1 ? '' : 's'} x ${label}`
}

interface StandingsTableProps {
  tournament: TournamentDto
  category?: number
  groupNumber?: number | null
}

export default function StandingsTable({ tournament, category, groupNumber }: StandingsTableProps) {
  const [modalCompetitors, setModalCompetitors] = useState<CompetitorDto[]>([])
  const rows = useMemo(() => computeStandings(tournament, category, groupNumber), [tournament, category, groupNumber])
  const competitorsById = useMemo(
    () => Object.fromEntries((tournament.competitors ?? []).map((c) => [c.id, c])),
    [tournament.competitors]
  )
  const showLeagueColumns =
    tournament.type === TournamentType.LEAGUE || tournament.type === TournamentType.GROUPS_PLAYOFF
  const showAmericanoColumns =
    tournament.type === TournamentType.AMERICANO || tournament.type === TournamentType.AMERICANO_WITH_SWAP
  const pointsLegend = useMemo(() => {
    const settings = tournament.settings

    if (showLeagueColumns) {
      const isGroups = tournament.type === TournamentType.GROUPS_PLAYOFF
      const defaults = isGroups ? DEFAULT_GROUPS_PLAYOFF_SETTINGS : DEFAULT_LEAGUE_SETTINGS
      const leagueSettings = { ...defaults, ...(settings ?? {}) }

      return [
        formatPoints(leagueSettings.pointsPerMatchWon, 'partido ganado'),
        formatPoints(leagueSettings.pointsPerSetWon, 'set ganado'),
        formatPoints(leagueSettings.pointsPerPresent, 'presentarse')
      ]
        .filter(Boolean)
        .join(' + ')
    }

    if (showAmericanoColumns) {
      const americanoSettings = { ...DEFAULT_AMERICANO_SETTINGS, ...(settings ?? {}) }

      return [
        formatPoints(americanoSettings.pointsPerGameWon, 'game ganado'),
        formatPoints(americanoSettings.pointsPerMatchWon, 'partido ganado')
      ]
        .filter(Boolean)
        .join(' + ')
    }

    return ''
  }, [tournament, showLeagueColumns, showAmericanoColumns])

  const handleCompetitorClick = (competitorId: number) => {
    const competitor = competitorsById[competitorId]

    if (competitor) {
      setModalCompetitors([competitor])
    }
  }

  return (
    <div className="standings-table">
      <TableContainer className="table">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell className="position-cell">#</TableCell>
              <TableCell className="competitor-name-cell">Competidor</TableCell>
              <TableCell align="center">PJ</TableCell>
              <TableCell align="center">PG</TableCell>
              {showLeagueColumns && <TableCell align="center">SF</TableCell>}
              {showLeagueColumns && <TableCell align="center">SC</TableCell>}
              {showLeagueColumns && <TableCell align="center">DS</TableCell>}
              {showLeagueColumns && <TableCell align="center">DG</TableCell>}
              {showAmericanoColumns && <TableCell align="center">PF</TableCell>}
              {showAmericanoColumns && <TableCell align="center">PC</TableCell>}
              {showAmericanoColumns && <TableCell align="center">DP</TableCell>}
              <TableCell align="center" className="points-cell">
                Pts
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.competitorId} className={index < 1 ? 'highlighted' : ''}>
                <TableCell className="position-cell">{index + 1}</TableCell>
                <TableCell
                  className="competitor-cell competitor-name-cell"
                  onClick={() => handleCompetitorClick(row.competitorId)}
                >
                  {competitorsById[row.competitorId]?.seedNumber != null
                    ? `[${competitorsById[row.competitorId].seedNumber}] ${row.shortName}`
                    : row.shortName}
                </TableCell>
                <TableCell align="center">{row.played}</TableCell>
                <TableCell align="center">{row.won}</TableCell>
                {showLeagueColumns && <TableCell align="center">{row.setsWon ?? 0}</TableCell>}
                {showLeagueColumns && <TableCell align="center">{row.setsLost ?? 0}</TableCell>}
                {showLeagueColumns && <TableCell align="center">{(row.setsWon ?? 0) - (row.setsLost ?? 0)}</TableCell>}
                {showLeagueColumns && (
                  <TableCell align="center">{(row.gamesWon ?? 0) - (row.gamesLost ?? 0)}</TableCell>
                )}
                {showAmericanoColumns && <TableCell align="center">{row.gamesWon ?? 0}</TableCell>}
                {showAmericanoColumns && <TableCell align="center">{row.gamesLost ?? 0}</TableCell>}
                {showAmericanoColumns && (
                  <TableCell align="center">{(row.gamesWon ?? 0) - (row.gamesLost ?? 0)}</TableCell>
                )}
                <TableCell align="center" className="points-cell">
                  {row.points}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!!pointsLegend && <div className="legend">Puntos: {pointsLegend}</div>}
      <CompetitorInfoModal
        open={modalCompetitors.length > 0}
        competitors={modalCompetitors}
        onClose={() => setModalCompetitors([])}
      />
    </div>
  )
}
