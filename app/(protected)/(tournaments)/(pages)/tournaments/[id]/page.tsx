import { Role } from '@/app/(auth)/models/Role'
import { auth } from '@/app/(auth)/services/auth'
import ManageTournamentView from '@/app/(protected)/(tournaments)/components/ManageTournamentView'
import PlayerTournamentView from '@/app/(protected)/(tournaments)/components/PlayerTournamentView'

/** Tournament detail: management view for organizers, read/play view for players. */
export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (session?.user?.roleId === Role.ORGANIZER) {
    return <ManageTournamentView tournamentId={Number(id)} appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''} />
  }

  return <PlayerTournamentView tournamentId={Number(id)} />
}
