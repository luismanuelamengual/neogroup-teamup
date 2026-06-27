import { redirect } from 'next/navigation'
import { Role } from '@/app/(auth)/models/Role'
import { auth } from '@/app/(auth)/services/auth'
import TournamentForm from '@/app/(protected)/(tournaments)/components/TournamentForm'

/** Tournament creation (organizer only). */
export default async function NewTournamentPage() {
  const session = await auth()

  if (session?.user?.roleId !== Role.ORGANIZER) {
    redirect('/tournaments')
  }

  return (
    <div>
      <TournamentForm />
    </div>
  )
}
