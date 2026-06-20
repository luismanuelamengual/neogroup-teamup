import { Role } from '@/app/(auth)/models/Role'
import { auth } from '@/app/(auth)/services/auth'
import OrganizerDashboard from '@/app/(protected)/(home)/components/OrganizerDashboard'
import PlayerDashboard from '@/app/(protected)/(home)/components/PlayerDashboard'

/** Home dashboard: organizer or player view depending on the active profile. */
export default async function HomePage() {
  const session = await auth()

  if (session?.user?.roleId === Role.ORGANIZER) {
    return <OrganizerDashboard />
  }

  return <PlayerDashboard />
}
