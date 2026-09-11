import { Discipline, Disciplines } from '@/app/(protected)/(tournaments)/models/Discipline'
import { Organization } from '@/app/models/Organization'
import { getCurrentOrganizationId } from '@/app/services/organization-context'

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
 *
 * `Organization` carries no OrganizationScope of its own — it IS the tenant
 * table — so the id comes from the current operation's context explicitly.
 */
export async function getEnabledDisciplines(): Promise<Discipline[]> {
  const organization = await Organization.where('id', await getCurrentOrganizationId()).first()
  const enabled = organization?.enabledDisciplines ?? []

  return Disciplines.filter((discipline) => enabled.includes(discipline))
}
