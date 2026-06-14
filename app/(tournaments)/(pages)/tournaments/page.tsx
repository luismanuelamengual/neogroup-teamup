import './page.scss'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import { Role } from '@/app/(auth)/models/Role'
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

  if (session?.user?.roleId === Role.ORGANIZER) {
    const { name, active } = await searchParams
    const t = await getTranslations('organizer')

    return (
      <div className="organizer-tournaments">
        <div className="header">
          <Typography variant="h5" component="h1" className="title">
            {t('title')}
          </Typography>
          {/* Plain href (no component={Link}): functions cannot cross the server → client boundary. */}
          <Button href="/tournaments/new" variant="contained" startIcon={<AddIcon />}>
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
      <Typography variant="h5" component="h1" className="title">
        {t('myTournamentsTitle')}
      </Typography>
      <PlayerTournamentsList />
    </div>
  )
}
