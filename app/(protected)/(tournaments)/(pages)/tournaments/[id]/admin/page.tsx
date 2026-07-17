import { auth } from '@/app/(auth)/services/auth'
import TournamentAdminView from '@/app/(protected)/(tournaments)/components/TournamentAdminView'
import { Role } from '@/app/models/Role'

/**
 * Tournament administration: organizer-only tools to manage categories and
 * competitors while the tournament is still in its registration phase.
 */
export default async function TournamentAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (session?.user?.roleId !== Role.ORGANIZER) {
    return null
  }

  return <TournamentAdminView tournamentId={Number(id)} />
}
