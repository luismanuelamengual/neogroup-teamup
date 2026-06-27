import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import JoinTournamentForm from '@/app/(protected)/(tournaments)/components/JoinTournamentForm'
import { Role } from '@/app/models/Role'

/** Tournament registration (player only). */
export default async function JoinTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (session?.user?.roleId !== Role.PLAYER) {
    redirect(`/tournaments/${id}`)
  }

  return <JoinTournamentForm tournamentId={Number(id)} />
}
