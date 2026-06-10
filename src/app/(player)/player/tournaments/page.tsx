import SearchIcon from '@mui/icons-material/Search'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import TournamentCard from '@/app/_components/tournament/TournamentCard'
import { getPlayerActiveTournaments } from '@/app/_utils/queries'

import './page.styles.scss'

export default async function PlayerTournamentsPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const t = await getTranslations('player')
  const tournaments = await getPlayerActiveTournaments(Number(session.user.id))

  return (
    <div className="player-tournaments">
      <Typography variant="h5" component="h1" className="player-tournaments__title">
        {t('myTournamentsTitle')}
      </Typography>
      {tournaments.length === 0 ? (
        <div className="player-tournaments__empty">
          <Typography color="text.secondary">{t('myTournamentsEmpty')}</Typography>
          <Button component={Link} href="/player/search" variant="contained" startIcon={<SearchIcon />}>
            {t('findTournaments')}
          </Button>
        </div>
      ) : (
        <div className="player-tournaments__list">
          {tournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              href={`/player/tournaments/${tournament.id}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
