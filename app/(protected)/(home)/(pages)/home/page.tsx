import { auth } from '@/app/(auth)/services/auth'
import AdministratorDashboard from '@/app/(protected)/(home)/components/AdministratorDashboard'
import OrganizerDashboard from '@/app/(protected)/(home)/components/OrganizerDashboard'
import PlayerDashboard from '@/app/(protected)/(home)/components/PlayerDashboard'
import { Role } from '@/app/models/Role'

/** Home dashboard: administrator, organizer or player view depending on the active profile. */
export default async function HomePage() {
  const session = await auth()

  if (session?.user?.roleId === Role.ADMINISTRATOR) {
    return <AdministratorDashboard />
  }

  if (session?.user?.roleId === Role.ORGANIZER) {
    return <OrganizerDashboard />
  }

  return <PlayerDashboard />
}
