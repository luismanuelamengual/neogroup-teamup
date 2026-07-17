import { headers } from 'next/headers'
import { auth } from '@/app/(auth)/services/auth'
import TournamentPlannerView from '@/app/(protected)/(tournaments)/components/TournamentPlannerView'
import { Role } from '@/app/models/Role'
import { resolveOrganizationImage } from '@/app/services/organizations'

/**
 * Match planner: organizer-only visual tool to place pending matches on a day,
 * court and time. Purely visual — nothing is persisted to the database.
 */
export default async function TournamentPlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  if (session?.user?.roleId !== Role.ORGANIZER) {
    return null
  }

  // Resolve the organization's logo on the server (falls back to the default
  // TeamUp logo) so the exported PDF is branded per club.
  const orgDomain = (await headers()).get('x-org-domain')
  const logoSrc = resolveOrganizationImage(orgDomain, 'logo.png')

  return <TournamentPlannerView tournamentId={Number(id)} logoSrc={logoSrc} />
}
