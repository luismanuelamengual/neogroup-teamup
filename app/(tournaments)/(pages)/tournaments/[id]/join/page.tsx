import { redirect } from 'next/navigation'
import { UserRoles } from '@/app/(auth)/models/user'
import { auth } from '@/app/(auth)/services/auth'
import JoinTournamentForm from '@/app/(tournaments)/components/JoinTournamentForm'

/** Tournament registration (player only). */
export default async function JoinTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (session?.user?.roleId !== UserRoles.PLAYER) {
    redirect(`/tournaments/${id}`)
  }

  return <JoinTournamentForm tournamentId={Number(id)} />
}
