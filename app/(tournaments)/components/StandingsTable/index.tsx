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
import { useMemo } from 'react'
import { TournamentDto } from '@/app/(tournaments)/models/TournamentDto'
import { TournamentType } from '@/app/(tournaments)/models/TournamentType'
import { computeStandings } from '@/app/(tournaments)/utils/standings'

interface StandingsTableProps {
  tournament: TournamentDto
  category?: string
}

export default function StandingsTable({ tournament, category }: StandingsTableProps) {
  const t = useTranslations('tournaments.standingsTable')
  const rows = useMemo(() => computeStandings(tournament, category), [tournament, category])

  return (
    <TableContainer component={Paper} className="standings-table">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell className="position-cell">{t('position')}</TableCell>
            <TableCell>{t('competitor')}</TableCell>
            <TableCell align="center">{t('played')}</TableCell>
            <TableCell align="center">{t('won')}</TableCell>
            {tournament.type === TournamentType.LEAGUE && <TableCell align="center">{t('setsWon')}</TableCell>}
            {tournament.type === TournamentType.AMERICANO && <TableCell align="center">{t('gamesWon')}</TableCell>}
            <TableCell align="center" className="points-cell">
              {t('points')}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.competitorId} className={index < 1 ? 'leader' : ''}>
              <TableCell className="position-cell">{index + 1}</TableCell>
              <TableCell>{row.displayName}</TableCell>
              <TableCell align="center">{row.played}</TableCell>
              <TableCell align="center">{row.won}</TableCell>
              {tournament.type === TournamentType.LEAGUE && <TableCell align="center">{row.setsWon ?? 0}</TableCell>}
              {tournament.type === TournamentType.AMERICANO && (
                <TableCell align="center">{row.gamesWon ?? 0}</TableCell>
              )}
              <TableCell align="center" className="points-cell">
                {row.points}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
