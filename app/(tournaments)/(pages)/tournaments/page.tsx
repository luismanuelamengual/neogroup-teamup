import './page.styles.scss'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { UserRoles } from '@/app/(auth)/models/user'
import { auth } from '@/app/(auth)/services/auth'
import OrganizerTournamentsList from '@/app/(tournaments)/components/OrganizerTournamentsList'
import PlayerTournamentsList from '@/app/(tournaments)/components/PlayerTournamentsList'
import TournamentFilters from '@/app/(tournaments)/components/TournamentFilters'

/** Tournaments home: renders the organizer or the player view depending on the active profile. */
export default async function TournamentsPage({
  searchParams
}: {
  searchParams: Promise<{ name?: string; active?: string }>
}) {
  const session = await auth()

  if (session?.user?.roleId === UserRoles.ORGANIZER) {
    const { name, active } = await searchParams
    const t = await getTranslations('organizer')

    return (
      <div className="organizer-tournaments">
        <div className="organizer-tournaments__header">
          <Typography variant="h5" component="h1" className="organizer-tournaments__title">
            {t('title')}
          </Typography>
          <Button component={Link} href="/tournaments/new" variant="contained" startIcon={<AddIcon />}>
            {t('create')}
          </Button>
        </div>
        <TournamentFilters name={name ?? ''} onlyActive={active === '1'} />
        <OrganizerTournamentsList name={name ?? ''} onlyActive={active === '1'} />
      </div>
    )
  }

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
