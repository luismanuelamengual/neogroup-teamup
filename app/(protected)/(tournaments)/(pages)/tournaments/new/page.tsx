import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import TournamentForm from '@/app/(protected)/(tournaments)/components/TournamentForm'
import { Role } from '@/app/models/Role'

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
