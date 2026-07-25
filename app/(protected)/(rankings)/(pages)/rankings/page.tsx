import './page.scss'
import { redirect } from 'next/navigation'
import { getSession } from '@/app/(auth)/services/auth'
import RankingsBrowser from '@/app/(protected)/(rankings)/components/RankingsBrowser'
import { Role } from '@/app/models/Role'

/** Rankings browser — identical for players and organizers. */
export default async function RankingsPage() {
  const session = await getSession()

  // Administrators manage users, not competition: this page is not part of their navigation.
  if (session?.user?.roleId === Role.ADMINISTRATOR) {
    redirect('/home')
  }

  return (
    <div className="rankings-page">
      <RankingsBrowser />
    </div>
  )
}
