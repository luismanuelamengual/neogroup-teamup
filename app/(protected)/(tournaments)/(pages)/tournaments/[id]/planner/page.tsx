import { auth } from '@/app/(auth)/services/auth'
import TournamentPlannerView from '@/app/(protected)/(tournaments)/components/TournamentPlannerView'
import { Role } from '@/app/models/Role'

/**
 * Match planner: organizer-only visual tool to place pending matches on a day,
 * court and time. Purely visual — nothing is persisted to the database.
 */
export default async function TournamentPlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (session?.user?.roleId !== Role.ORGANIZER) {
    return null
  }

  return <TournamentPlannerView tournamentId={Number(id)} />
}
