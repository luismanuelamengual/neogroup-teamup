import { notFound, redirect } from 'next/navigation'
import { getTournamentDetail } from '@/app/_utils/queries'
import ManageTournamentView from '@/app/(organizer)/organizer/tournaments/[id]/_components/ManageTournamentView'
import { auth } from '@/auth'

export default async function ManageTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const detail = await getTournamentDetail(Number(id))

  if (!detail || detail.tournament.ownerId !== Number(session.user.id)) {
    notFound()
  }

  return (
    <ManageTournamentView
      tournament={detail.tournament}
      competitors={detail.competitors}
      rounds={detail.rounds}
      matches={detail.matches}
      appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''}
    />
  )
}
