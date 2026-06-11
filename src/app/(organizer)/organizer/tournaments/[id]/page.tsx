import ManageTournamentView from '@/app/(organizer)/organizer/tournaments/[id]/_components/ManageTournamentView'

export default async function ManageTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return <ManageTournamentView tournamentId={Number(id)} appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ''} />
}
