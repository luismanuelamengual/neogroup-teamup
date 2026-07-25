import { DB } from '@neogroup/neorm'
import { Site } from '@/app/(protected)/(sites)/models/Site'
import { SiteFilters } from '@/app/(protected)/(sites)/models/SiteFilters'
import { SiteInput } from '@/app/(protected)/(sites)/models/SiteInput'
import { ApiException } from '@/app/models/ApiException'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'

/**
 * Administration of the venues ("sedes") of an organization — the ABM behind
 * the administrator's "Sedes" page, and the source of the SiteSelector used
 * across the tournament forms.
 *
 * Every query goes through the Site entity, so the OrganizationScope applies
 * and no site of another organization is ever reachable; each lookup by id
 * re-checks `organizationId` explicitly on top of that.
 */

/** Validates and normalizes the name of a site. */
function normalizeName(input: SiteInput): string {
  const name = (input.name ?? '').trim()

  if (!name) {
    throw new ApiException('El nombre de la sede es obligatorio')
  }

  return name
}

/** Finds a site of the organization, or throws a 404. */
async function findSite(organizationId: number, siteId: number): Promise<Site> {
  const site = await Site.where('organizationId', organizationId).where('id', siteId).first()

  if (!site) {
    throw new ApiException('Sede no encontrada', 404)
  }

  return site
}

/**
 * Rejects a name already taken by another site of the same organization.
 * Comparison is case-insensitive: "Club Belgrano" and "club belgrano" are the
 * same venue, and allowing both would recreate the mess that the free-text
 * `location` column used to be.
 */
async function assertNameIsAvailable(organizationId: number, name: string, excludedId?: number): Promise<void> {
  const siblings = await Site.where('organizationId', organizationId).get()
  const taken = siblings.some((site) => site.id !== excludedId && site.name.toLowerCase() === name.toLowerCase())

  if (taken) {
    throw new ApiException('Ya existe una sede con ese nombre')
  }
}

/** Paginated listing of the sites of an organization, searchable by name. */
export async function getSites(
  organizationId: number,
  { query, page = 1, pageSize = 10 }: SiteFilters = {}
): Promise<PaginatedResponse<Site[]>> {
  const sitesQuery = Site.where('organizationId', organizationId)
  const normalized = (query ?? '').trim()

  if (normalized.length > 0) {
    // Explicit ILIKE: neorm's whereLike defaults to a case-sensitive LIKE on
    // PostgreSQL (same caveat as services/users.ts).
    sitesQuery.where('name', 'ILIKE', `%${normalized}%`)
  }

  return sitesQuery.orderBy('name').paginate(pageSize, page)
}

/** Creates a site of the organization. */
export async function createSite(organizationId: number, input: SiteInput): Promise<Site> {
  const name = normalizeName(input)

  await assertNameIsAvailable(organizationId, name)

  const site = new Site()

  site.organizationId = organizationId
  site.name = name
  await site.save()

  return site
}

/** Renames a site of the organization. */
export async function updateSite(organizationId: number, siteId: number, input: SiteInput): Promise<Site> {
  const site = await findSite(organizationId, siteId)
  const name = normalizeName(input)

  await assertNameIsAvailable(organizationId, name, site.id)

  site.name = name
  await site.save()

  return site
}

/**
 * Permanently deletes a site of the organization.
 *
 * Sites used by a tournament are rejected instead of deleted: the foreign key
 * would refuse the DELETE anyway, and blanking the reference would erase where
 * past tournaments were played.
 */
export async function deleteSite(organizationId: number, siteId: number): Promise<void> {
  const site = await findSite(organizationId, siteId)
  const tournaments = Number(await DB.table('tournaments').where('siteId', site.id).count())

  if (tournaments > 0) {
    throw new ApiException(
      `La sede está asignada a ${tournaments} torneo${tournaments === 1 ? '' : 's'} y no puede eliminarse.`
    )
  }

  await site.delete()
}
