import { auth } from '@/app/(auth)/services/auth'
import AdministratorDashboard from '@/app/(protected)/(home)/components/AdministratorDashboard'
import OrganizerDashboard from '@/app/(protected)/(home)/components/OrganizerDashboard'
import PlayerDashboard from '@/app/(protected)/(home)/components/PlayerDashboard'
import InstallAppBanner from '@/app/components/InstallAppBanner'
import { Role } from '@/app/models/Role'

/** Home dashboard: administrator, organizer or player view depending on the active profile. */
export default async function HomePage() {
  const session = await auth()
  const roleId = session?.user?.roleId
  const dashboard =
    roleId === Role.ADMINISTRATOR ? (
      <AdministratorDashboard />
    ) : roleId === Role.ORGANIZER ? (
      <OrganizerDashboard />
    ) : (
      <PlayerDashboard />
    )

  return (
    <>
      <InstallAppBanner />
      {dashboard}
    </>
  )
}
