import './page.scss'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import { getTranslations } from 'next-intl/server'
import { Role } from '@/app/(auth)/models/Role'
import { auth } from '@/app/(auth)/services/auth'
import TournamentsBrowser from '@/app/(protected)/(tournaments)/components/TournamentsBrowser'

/** Unified tournaments browser: the same generic search for players and organizers. */
export default async function TournamentsPage() {
  const session = await auth()
  const isOrganizer = session?.user?.roleId === Role.ORGANIZER
  const t = await getTranslations('tournaments')

  return (
    <div className="tournaments-page">
      {isOrganizer && (
        <div className="header">
          <Button href="/tournaments/new" variant="contained" startIcon={<AddIcon />}>
            {t('browse.create')}
          </Button>
        </div>
      )}
      <TournamentsBrowser />
    </div>
  )
}
