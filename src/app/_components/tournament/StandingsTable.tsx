'use client'

import './StandingsTable.styles.scss'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { useTranslations } from 'next-intl'
import { StandingsRowDto } from '@/app/_models/dtos'
import { TournamentType } from '@/app/_models/types'

interface StandingsTableProps {
  type: TournamentType
  rows: StandingsRowDto[]
}

export default function StandingsTable({ type, rows }: StandingsTableProps) {
  const t = useTranslations('tournaments.standingsTable')

  return (
    <TableContainer component={Paper} className="standings-table">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell className="standings-table__position-cell">{t('position')}</TableCell>
            <TableCell>{t('competitor')}</TableCell>
            <TableCell align="center">{t('played')}</TableCell>
            <TableCell align="center">{t('won')}</TableCell>
            {type === 'league' && <TableCell align="center">{t('setsWon')}</TableCell>}
            {type === 'americano' && <TableCell align="center">{t('gamesWon')}</TableCell>}
            <TableCell align="center" className="standings-table__points-cell">
              {t('points')}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.competitorId} className={index < 1 ? 'standings-table__row--leader' : ''}>
              <TableCell className="standings-table__position-cell">{index + 1}</TableCell>
              <TableCell>{row.displayName}</TableCell>
              <TableCell align="center">{row.played}</TableCell>
              <TableCell align="center">{row.won}</TableCell>
              {type === 'league' && <TableCell align="center">{row.setsWon ?? 0}</TableCell>}
              {type === 'americano' && <TableCell align="center">{row.gamesWon ?? 0}</TableCell>}
              <TableCell align="center" className="standings-table__points-cell">
                {row.points}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
