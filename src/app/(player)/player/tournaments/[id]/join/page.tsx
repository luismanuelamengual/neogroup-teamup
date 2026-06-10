import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import { registersAsPairs } from '@/app/_models/types'
import { getTournamentDetail, getUserCompetitorEntry } from '@/app/_utils/queries'
import JoinTournamentForm from '@/app/(player)/player/tournaments/[id]/join/_components/JoinTournamentForm'

export default async function JoinTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/player/tournaments/${id}/join`)}`)
  }

  const detail = await getTournamentDetail(Number(id))

  if (!detail) {
    notFound()
  }

  const userEntry = await getUserCompetitorEntry(Number(id), Number(session.user.id))

  // Already registered or registration closed → back to the tournament page.
  if (userEntry || detail.tournament.status !== 'stand_by') {
    redirect(`/player/tournaments/${id}`)
  }

  return (
    <JoinTournamentForm
      tournament={detail.tournament}
      needsPartner={registersAsPairs(
        detail.tournament.discipline,
        detail.tournament.type,
        detail.tournament.settings
      )}
    />
  )
}
