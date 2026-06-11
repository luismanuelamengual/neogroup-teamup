import './page.styles.scss'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import PlayerTournamentsList from '@/app/(player)/player/tournaments/_components/PlayerTournamentsList'

export default async function PlayerTournamentsPage() {
  const t = await getTranslations('player')

  return (
    <div className="player-tournaments">
      <Typography variant="h5" component="h1" className="player-tournaments__title">
        {t('myTournamentsTitle')}
      </Typography>
      <PlayerTournamentsList />
    </div>
  )
}
