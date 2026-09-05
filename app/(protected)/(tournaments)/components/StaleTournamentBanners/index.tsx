'use client'

import './index.scss'
import Alert from '@mui/material/Alert'
import dayjs from 'dayjs'
import Link from 'next/link'
import { useTournaments } from '@/app/(protected)/(tournaments)/hooks/useTournaments'
import { useLoadingData } from '@/app/hooks/useLoadingData'

/**
 * Reminder shown on the organizer home for every ONGOING tournament that has
 * had no match activity in a while (see `getStaleTournaments` on the server for
 * the exact rule). Left as is, those tournaments never auto-finish
 * (`processTournaments` only closes a tournament once every match is loaded),
 * so their ranking points never get awarded — the tournament's own name links
 * straight to it so the organizer can load what's missing.
 *
 * One alert per tournament, unlike OverduePaymentsBanner's single aggregate
 * count: here each tournament needs its own link.
 */
export default function StaleTournamentBanners() {
  const { getStaleTournaments } = useTournaments()
  const { data: staleTournaments } = useLoadingData(() => getStaleTournaments(), [getStaleTournaments], [])

  if (staleTournaments.length === 0) {
    return null
  }

  return (
    <div className="stale-tournament-banners">
      {staleTournaments.map((tournament) => {
        const daysSinceActivity = dayjs().diff(dayjs(tournament.lastActivityAt), 'day')

        return (
          <Alert key={tournament.id} severity="warning" className="stale-tournament-banner">
            <b>Atención !!</b> el torneo{' '}
            <Link href={`/tournaments/${tournament.id}`}>
              <strong>{tournament.name}</strong>
            </Link>{' '}
            no ha sido finalizado y todavía tiene partidos sin cargar{' '}
            {daysSinceActivity > 0 ? ` (sin actividad hace ${daysSinceActivity} días)` : ''}. Por favor, cargá el
            resultado de los partidos faltantes y luego finalizá el torneo para que se puedan repartir los puntos de
            ranking.
          </Alert>
        )
      })}
    </div>
  )
}
