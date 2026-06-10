import './page.styles.scss'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import TournamentCard from '@/app/_components/tournament/TournamentCard'
import { searchTournaments } from '@/app/_utils/queries'
import TournamentSearchBar from '@/app/(player)/player/search/_components/TournamentSearchBar'

export default async function PlayerSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const t = await getTranslations('player')
  const tournaments = await searchTournaments(q ?? '')

  return (
    <div className="player-search">
      <Typography variant="h5" component="h1" className="player-search__title">
        {t('searchTitle')}
      </Typography>
      <TournamentSearchBar query={q ?? ''} />
      {tournaments.length === 0 ? (
        <Typography color="text.secondary" className="player-search__empty">
          {t('searchEmpty')}
        </Typography>
      ) : (
        <div className="player-search__list">
          {tournaments.map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament} href={`/player/tournaments/${tournament.id}`} />
          ))}
        </div>
      )}
    </div>
  )
}
