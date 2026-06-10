import { notFound, redirect } from 'next/navigation'

import { auth } from '@/auth'
import { getTournamentDetail, getUserCompetitorEntry } from '@/app/_utils/queries'
import PlayerTournamentView from '@/app/(player)/player/tournaments/[id]/_components/PlayerTournamentView'

export default async function PlayerTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const detail = await getTournamentDetail(Number(id))

  if (!detail) {
    notFound()
  }

  const userId = Number(session.user.id)
  const userEntry = await getUserCompetitorEntry(Number(id), userId)

  return (
    <PlayerTournamentView
      tournament={detail.tournament}
      competitors={detail.competitors}
      rounds={detail.rounds}
      matches={detail.matches}
      userEntry={userEntry}
    />
  )
}
