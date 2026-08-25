'use client'

import 'dayjs/locale/es'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import PlaceIcon from '@mui/icons-material/Place'
import Skeleton from '@mui/material/Skeleton'
import Typography from '@mui/material/Typography'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useCallback } from 'react'
import { useDashboard } from '@/app/(protected)/(home)/hooks/useDashboard'
import { useLoadingData } from '@/app/hooks/useLoadingData'

/**
 * "Tus próximos partidos": the player's own matches scheduled in the next two
 * weeks, across every tournament they currently compete in. Renders nothing
 * once loaded if there is nothing in that window — this section only ever
 * shows up when it has something to say.
 */
export default function UpcomingMatches() {
  const { getUpcomingMatches } = useDashboard()
  const load = useCallback(() => getUpcomingMatches(), [getUpcomingMatches])
  const { data: matches, loading } = useLoadingData(load, [load], [])

  if (matches.length === 0) {
    return null
  }

  return (
    <section className="panel">
      <Typography variant="h6" className="panel-title">
        Tus próximos partidos
      </Typography>
      <div className="match-list">
        {loading
          ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} variant="rounded" height={78} />)
          : matches.map((match) => (
              <div key={match.matchId} className="match-row">
                <div className="match-info">
                  <Link href={`/tournaments/${match.tournamentId}`} className="match-tournament">
                    {match.tournamentName}
                    {match.categoryName ? ` · ${match.categoryName}` : ''}
                  </Link>
                  <span className="match-opponent">vs. {match.opponentName}</span>
                  <div className="match-schedule">
                    <span className="match-schedule-item">
                      <CalendarMonthIcon fontSize="inherit" />
                      {dayjs(match.date).locale('es').format('ddd D MMM')}
                      {match.hour ? ` · ${match.hour}` : ''}
                    </span>
                    {match.siteName && (
                      <span className="match-schedule-item">
                        <PlaceIcon fontSize="inherit" />
                        {match.siteName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
      </div>
    </section>
  )
}
