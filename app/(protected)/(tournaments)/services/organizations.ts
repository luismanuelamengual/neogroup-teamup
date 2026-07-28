import { Discipline, Disciplines } from '@/app/(protected)/(tournaments)/models/Discipline'
import { Organization } from '@/app/models/Organization'

/**
 * Disciplines enabled for an organization, in catalogue order
 * (see `Organization.enabledDisciplines` and migration 011).
 *
 * Queries the model directly rather than through the cached `getOrganization`
 * helper (`app/services/organizations.ts`): that helper wraps its reads in
 * Next.js' `unstable_cache`, which requires a real Next.js request/build
 * context and throws outside of one (e.g. in the test suite, which calls
 * this — through createCategory/createTournament — directly). A plain,
 * uncached read is cheap enough here, and matches how the rest of these
 * services already resolve catalogue rows (e.g. `resolveSiteId`).
 */
export async function getEnabledDisciplines(organizationId: number): Promise<Discipline[]> {
  const organization = await Organization.where('id', organizationId).first()
  const enabled = organization?.enabledDisciplines ?? []

  return Disciplines.filter((discipline) => enabled.includes(discipline))
}
