import { headers } from 'next/headers'
import { auth } from '@/app/(auth)/services/auth'
import ManageTournamentView from '@/app/(protected)/(tournaments)/components/ManageTournamentView'
import OrganizerJoinNotice from '@/app/(protected)/(tournaments)/components/OrganizerJoinNotice'
import PlayerTournamentView from '@/app/(protected)/(tournaments)/components/PlayerTournamentView'
import { Role } from '@/app/models/Role'
import { resolveAppUrl } from '@/app/utils/domains'

/** Tournament detail: management view for organizers, read/play view for players. */
export default async function TournamentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ join?: string }>
}) {
  const { id } = await params
  const { join } = await searchParams
  const session = await auth()

  if (session?.user?.roleId === Role.ORGANIZER) {
    // Join links (/tournaments/[id]/join) redirect here with `?join=1` for
    // everyone, players and organizers alike. An organizer landing on that
    // link (e.g. another organizer's invite was shared with them) can't
    // register as a competitor, so short-circuit the usual management view
    // with an explanatory notice instead of silently opening it.
    if (join === '1') {
      return <OrganizerJoinNotice />
    }

    // Multi-tenant: each organization is served from its own subdomain, so the
    // join-link base URL must come from the current request's Host header
    // (same pattern as forgotPassword/verifyEmail/registerUser and the
    // joinTournament payment flow), not from a single static env var.
    const appUrl = resolveAppUrl((await headers()).get('host') ?? '')

    return <ManageTournamentView tournamentId={Number(id)} appUrl={appUrl} />
  }

  return <PlayerTournamentView tournamentId={Number(id)} />
}
