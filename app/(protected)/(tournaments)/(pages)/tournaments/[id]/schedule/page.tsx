import { auth } from '@/app/(auth)/services/auth'
import TournamentScheduleView from '@/app/(protected)/(tournaments)/components/TournamentScheduleView'
import { getTournament } from '@/app/(protected)/(tournaments)/services/tournaments'

/**
 * Published schedule: what the organizer planned, as the people who have to
 * show up read it — a day-by-day order of play rather than a planner.
 *
 * Open to anyone signed in to the organization the tournament belongs to. It is
 * built for players (the "Ver programación" button on the tournament page is
 * theirs), but there is nothing to hide from an organizer who follows the link:
 * it is the same sheet they export, minus the ability to change it.
 */
export default async function TournamentSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (!session?.user?.id) {
    return null
  }

  const tournament = await getTournament({ id: Number(id) })

  if (!tournament || tournament.organizationId !== session.user.organizationId) {
    return null
  }

  return <TournamentScheduleView tournamentId={Number(id)} />
}
