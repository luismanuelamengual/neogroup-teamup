import { headers } from 'next/headers'
import { auth } from '@/app/(auth)/services/auth'
import InterclubsPlannerView from '@/app/(protected)/(tournaments)/components/InterclubsPlannerView'
import TournamentPlannerView from '@/app/(protected)/(tournaments)/components/TournamentPlannerView'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { getTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { Role } from '@/app/models/Role'
import { resolveOrganizationImage } from '@/app/services/organizations'

/**
 * Match planner: organizer-only tool to place pending matches on a venue, day,
 * court and time. Every placement is stored on the match itself (siteId / date /
 * hour / courtNumber), so the schedule is visible everywhere the match is shown.
 *
 * Interclubes tournaments get their own planner instead: there the venue is not
 * the organizer's to choose (a series is played at the home team's club), so the
 * grid is laid out by club rather than by court and the export is the
 * "programación" sheet those tournaments are published as.
 */
export default async function TournamentPlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (session?.user?.roleId !== Role.ORGANIZER) {
    return null
  }

  // Which planner to open is a property of the tournament, so it is resolved
  // here rather than by the views: otherwise the page would have to mount one
  // planner, let it load the tournament and then swap it for the other.
  const tournament = await getTournament({ id: Number(id) })

  if (!tournament || tournament.organizationId !== session.user.organizationId) {
    return null
  }

  // Resolve the organization's logo on the server (falls back to the default
  // TeamUp logo) so the exported PDF is branded per club. Uses the white "bar"
  // logo variant, which sits directly on the PDF's teal header.
  const orgDomain = (await headers()).get('x-org-domain')
  const logoSrc = resolveOrganizationImage(orgDomain, 'logo-bar.png')

  if (tournament.type === TournamentType.INTERCLUBS) {
    return <InterclubsPlannerView tournamentId={Number(id)} logoSrc={logoSrc} />
  }

  return <TournamentPlannerView tournamentId={Number(id)} logoSrc={logoSrc} />
}
