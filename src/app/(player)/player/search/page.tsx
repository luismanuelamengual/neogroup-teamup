import './page.styles.scss'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import TournamentSearchBar from '@/app/(player)/player/search/_components/TournamentSearchBar'
import TournamentSearchResults from '@/app/(player)/player/search/_components/TournamentSearchResults'

export default async function PlayerSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const t = await getTranslations('player')

  return (
    <div className="player-search">
      <Typography variant="h5" component="h1" className="player-search__title">
        {t('searchTitle')}
      </Typography>
      <TournamentSearchBar query={q ?? ''} />
      <TournamentSearchResults query={q ?? ''} />
    </div>
  )
}
