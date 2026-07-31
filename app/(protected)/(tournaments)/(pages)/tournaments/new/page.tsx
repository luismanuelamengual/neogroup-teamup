import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import { hasOverdueDebt } from '@/app/(protected)/(payments)/services/payments'
import TournamentForm from '@/app/(protected)/(tournaments)/components/TournamentForm'
import { Role } from '@/app/models/Role'

/** Tournament creation (organizer only, and only while the organization is up to date with TeamUp). */
export default async function NewTournamentPage() {
  const session = await auth()

  if (session?.user?.roleId !== Role.ORGANIZER) {
    redirect('/tournaments')
  }

  const organizationId = Number(session.user.organizationId)

  // Same rule the creation service enforces: an organization owing tournaments
  // older than a month cannot open new ones. Checked here too so the form is
  // never rendered just to fail on submit.
  if (organizationId && (await hasOverdueDebt(organizationId))) {
    redirect('/payments')
  }

  return (
    <div>
      <TournamentForm />
    </div>
  )
}
