import JoinTournamentForm from '@/app/(player)/player/tournaments/[id]/join/_components/JoinTournamentForm'

export default async function JoinTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return <JoinTournamentForm tournamentId={Number(id)} />
}
