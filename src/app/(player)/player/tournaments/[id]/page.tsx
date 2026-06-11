import PlayerTournamentView from '@/app/(player)/player/tournaments/[id]/_components/PlayerTournamentView'

export default async function PlayerTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return <PlayerTournamentView tournamentId={Number(id)} />
}
