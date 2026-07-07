import { headers } from 'next/headers'
import { auth } from '@/app/(auth)/services/auth'
import ManageTournamentView from '@/app/(protected)/(tournaments)/components/ManageTournamentView'
import PlayerTournamentView from '@/app/(protected)/(tournaments)/components/PlayerTournamentView'
import { Role } from '@/app/models/Role'
import { resolveAppUrl } from '@/app/utils/domains'

/** Tournament detail: management view for organizers, read/play view for players. */
export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (session?.user?.roleId === Role.ORGANIZER) {
    // Multi-tenant: each organization is served from its own subdomain, so the
    // join-link base URL must come from the current request's Host header
    // (same pattern as forgotPassword/verifyEmail/registerUser and the
    // joinTournament payment flow), not from a single static env var.
    const appUrl = resolveAppUrl((await headers()).get('host') ?? '')

    return <ManageTournamentView tournamentId={Number(id)} appUrl={appUrl} />
  }

  return <PlayerTournamentView tournamentId={Number(id)} />
}
