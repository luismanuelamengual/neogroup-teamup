'use client'

import './index.scss'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import CompetitorInfoModal from '@/app/(protected)/(tournaments)/components/CompetitorInfoModal'
import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'
import { TournamentDto } from '@/app/(protected)/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(protected)/(tournaments)/utils/standings'

interface StandingsTableProps {
  tournament: TournamentDto
  category?: number
  groupNumber?: number | null
}

export default function StandingsTable({ tournament, category, groupNumber }: StandingsTableProps) {
  const t = useTranslations('tournaments.standingsTable')
  const [modalCompetitors, setModalCompetitors] = useState<CompetitorDto[]>([])
  const rows = useMemo(
    () => computeStandings(tournament, category, groupNumber),
    [tournament, category, groupNumber]
  )
  const competitorsById = useMemo(
    () => Object.fromEntries((tournament.competitors ?? []).map((c) => [c.id, c])),
    [tournament.competitors]
  )
  const showSets = tournament.type === TournamentType.LEAGUE || tournament.type === TournamentType.GROUPS_PLAYOFF
  const showGames =
    tournament.type === TournamentType.AMERICANO || tournament.type === TournamentType.AMERICANO_WITH_SWAP

  const handleCompetitorClick = (competitorId: number) => {
    const competitor = competitorsById[competitorId]

    if (competitor) {
      setModalCompetitors([competitor])
    }
  }

  return (
    <>
      <TableContainer component={Paper} className="standings-table">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell className="position-cell">{t('position')}</TableCell>
              <TableCell>{t('competitor')}</TableCell>
              <TableCell align="center">{t('played')}</TableCell>
              <TableCell align="center">{t('won')}</TableCell>
              {showSets && <TableCell align="center">{t('setsWon')}</TableCell>}
              {showGames && <TableCell align="center">{t('gamesWon')}</TableCell>}
              <TableCell align="center" className="points-cell">
                {t('points')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.competitorId} className={index < 1 ? 'leader' : ''}>
                <TableCell className="position-cell">{index + 1}</TableCell>
                <TableCell
                  className="competitor-cell"
                  onClick={() => handleCompetitorClick(row.competitorId)}
                >
                  {row.displayName}
                </TableCell>
                <TableCell align="center">{row.played}</TableCell>
                <TableCell align="center">{row.won}</TableCell>
                {showSets && <TableCell align="center">{row.setsWon ?? 0}</TableCell>}
                {showGames && <TableCell align="center">{row.gamesWon ?? 0}</TableCell>}
                <TableCell align="center" className="points-cell">
                  {row.points}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <CompetitorInfoModal
        open={modalCompetitors.length > 0}
        competitors={modalCompetitors}
        onClose={() => setModalCompetitors([])}
      />
    </>
  )
}
