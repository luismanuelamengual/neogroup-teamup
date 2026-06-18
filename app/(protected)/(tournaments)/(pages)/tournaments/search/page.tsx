import './page.scss'
import Typography from '@mui/material/Typography'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Role } from '@/app/(auth)/models/Role'
import { auth } from '@/app/(auth)/services/auth'
import TournamentSearchBar from '@/app/(protected)/(tournaments)/components/TournamentSearchBar'
import TournamentSearchResults from '@/app/(protected)/(tournaments)/components/TournamentSearchResults'

/** Tournament search (player only). */
export default async function TournamentSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth()

  if (session?.user?.roleId !== Role.PLAYER) {
    redirect('/tournaments')
  }

  const { q } = await searchParams
  const t = await getTranslations('player')

  return (
    <div className="player-search">
      <Typography variant="h5" component="h1" className="title">
        {t('searchTitle')}
      </Typography>
      <TournamentSearchBar query={q ?? ''} />
      <TournamentSearchResults query={q ?? ''} />
    </div>
  )
}
