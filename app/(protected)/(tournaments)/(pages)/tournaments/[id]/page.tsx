import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import OrganizerJoinNotice from '@/app/(protected)/(tournaments)/components/OrganizerJoinNotice'
import TournamentView from '@/app/(protected)/(tournaments)/components/TournamentView'
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

  // Administrators manage users, not tournaments: this page is not part of their navigation.
  if (session?.user?.roleId === Role.ADMINISTRATOR) {
    redirect('/home')
  }

  const isOrganizer = session?.user?.roleId === Role.ORGANIZER

  // Join links (/tournaments/[id]/join) redirect here with `?join=1` for
  // everyone, players and organizers alike. An organizer landing on that
  // link (e.g. another organizer's invite was shared with them) can't
  // register as a competitor, so short-circuit the usual management view
  // with an explanatory notice instead of silently opening it.
  if (isOrganizer && join === '1') {
    return <OrganizerJoinNotice />
  }

  // Multi-tenant: each organization is served from its own subdomain, so the
  // join-link base URL must come from the current request's Host header
  // (same pattern as forgotPassword/verifyEmail/registerUser and the
  // joinTournament payment flow), not from a single static env var.
  const appUrl = resolveAppUrl((await headers()).get('host') ?? '')

  return <TournamentView tournamentId={Number(id)} appUrl={appUrl} isOrganizer={isOrganizer} />
}
