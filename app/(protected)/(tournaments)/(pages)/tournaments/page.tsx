import './page.scss'
import { getSession } from '@/app/(auth)/services/auth'
import TournamentsBrowser from '@/app/(protected)/(tournaments)/components/TournamentsBrowser'
import { Role } from '@/app/models/Role'

/** Unified tournaments browser: the same generic search for players and organizers. */
export default async function TournamentsPage() {
  const session = await getSession()
  const isOrganizer = session?.user?.roleId === Role.ORGANIZER

  return (
    <div className="tournaments-page">
      <TournamentsBrowser showCreationButton={isOrganizer} />
    </div>
  )
}
