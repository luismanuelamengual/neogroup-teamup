import { DB } from '@neogroup/neorm'
import { Site } from '@/app/(protected)/(sites)/models/Site'
import { MAX_SITE_COURTS, SiteData } from '@/app/(protected)/(sites)/models/SiteData'
import { SiteFilters } from '@/app/(protected)/(sites)/models/SiteFilters'
import { SiteInput } from '@/app/(protected)/(sites)/models/SiteInput'
import { ApiException } from '@/app/models/ApiException'
import { PaginatedResponse } from '@/app/models/PaginatedResponse'
import { getCurrentOrganizationId } from '@/app/services/organization-context'

/**
 * Administration of the venues ("sedes") of an organization — the ABM behind
 * the administrator's "Sedes" page, and the source of the SiteSelector used
 * across the tournament forms.
 *
 * No function here takes an organizationId: every query goes through the Site
 * entity, whose OrganizationScope pins it to the organization of the current
 * operation (see services/organization-context.ts), so a site of another
 * organization is not reachable — a lookup by a foreign id simply finds
 * nothing and 404s. The one place the organization is still named is the insert
 * in `createSite`, where it is the value of a column rather than a filter.
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
async function findSite(siteId: number): Promise<Site> {
  const site = await Site.where('id', siteId).first()

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
async function assertNameIsAvailable(name: string, excludedId?: number): Promise<void> {
  const siblings = await Site.get()
  const taken = siblings.some((site) => site.id !== excludedId && site.name.toLowerCase() === name.toLowerCase())

  if (taken) {
    throw new ApiException('Ya existe una sede con ese nombre')
  }
}

/**
 * Resolves the id of a venue of the organization, or null when none was given.
 *
 * Sites belong to the catalogue the administrator maintains (the /sites ABM),
 * so an id that is not one of the organization's is rejected rather than
 * silently stored — and "not one of the organization's" is decided by the
 * Site entity's own scope, so a forged id from another club simply does not
 * resolve.
 *
 * Shared by everything that stores a reference to a venue: a tournament's site,
 * a match's planned site, and a user's home venue. It used to be copy-pasted in
 * three places, each with its own organizationId parameter.
 */
export async function resolveSiteId(siteId: unknown): Promise<number | null> {
  if (siteId === undefined || siteId === null || siteId === '') {
    return null
  }

  const id = Number(siteId)

  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiException('La sede seleccionada no es válida')
  }

  const site = await Site.where('id', id).first()

  if (!site) {
    throw new ApiException('La sede seleccionada no es válida')
  }

  return site.id
}

/** Paginated listing of the sites of an organization, searchable by name. */
export async function getSites({ query, page = 1, pageSize = 10 }: SiteFilters = {}): Promise<
  PaginatedResponse<Site[]>
> {
  const sitesQuery = Site.orderBy('name')
  const normalized = (query ?? '').trim()

  if (normalized.length > 0) {
    // Explicit ILIKE: neorm's whereLike defaults to a case-sensitive LIKE on
    // PostgreSQL (same caveat as services/users.ts).
    sitesQuery.where('name', 'ILIKE', `%${normalized}%`)
  }

  return sitesQuery.paginate(pageSize, page)
}

/** Creates a site of the organization. */
export async function createSite(input: SiteInput): Promise<Site> {
  const name = normalizeName(input)

  await assertNameIsAvailable(name)

  const site = new Site()

  // An insert applies no scopes, so this is the one place the organization is
  // written rather than filtered by.
  site.organizationId = await getCurrentOrganizationId()
  site.name = name
  await site.save()

  return site
}

/** Renames a site of the organization. */
export async function updateSite(siteId: number, input: SiteInput): Promise<Site> {
  const site = await findSite(siteId)
  const name = normalizeName(input)

  await assertNameIsAvailable(name, site.id)

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
export async function deleteSite(siteId: number): Promise<void> {
  const site = await findSite(siteId)
  const tournaments = Number(await DB.table('tournaments').where('siteId', site.id).count())

  if (tournaments > 0) {
    throw new ApiException(
      `La sede está asignada a ${tournaments} torneo${tournaments === 1 ? '' : 's'} y no puede eliminarse.`
    )
  }

  await site.delete()
}

/**
 * Sanitizes the settings document an organizer submits for a venue.
 *
 * `sites.data` is schemaless by design (see SiteData), which makes it exactly
 * the kind of column that quietly accumulates whatever a client happens to
 * send. So it is rebuilt field by field here rather than stored as received:
 * unknown keys are dropped, the courts count is clamped to the range the
 * planner offers, and a court name that adds nothing — blank, or the very
 * "Cancha N" it would fall back to anyway — is left out instead of stored.
 *
 * Returns null when nothing survived, so an emptied setup clears the column
 * rather than leaving `{}` behind.
 */
function normalizeSiteData(input: SiteData | null | undefined): SiteData | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const data: SiteData = {}
  const courts = Number(input.courts)

  if (Number.isInteger(courts) && courts >= 1) {
    data.courts = Math.min(MAX_SITE_COURTS, courts)
  }

  const matchDuration = Number(input.matchDuration)

  if (Number.isInteger(matchDuration) && matchDuration > 0) {
    data.matchDuration = matchDuration
  }

  const courtNames: Record<number, string> = {}

  for (const [key, value] of Object.entries(input.courtNames ?? {})) {
    const court = Number(key)
    const name = typeof value === 'string' ? value.trim() : ''

    if (!Number.isInteger(court) || court < 1 || name === '' || name === `Cancha ${court}`) {
      continue
    }

    courtNames[court] = name.slice(0, 60)
  }

  if (Object.keys(courtNames).length > 0) {
    data.courtNames = courtNames
  }

  return Object.keys(data).length > 0 ? data : null
}

/**
 * Stores the settings of a venue — its courts setup and the duration it was
 * last planned with.
 *
 * Unlike the rest of this module this one is not the administrator's: it is
 * written by the organizer's planner, on every change, for whichever venue is
 * being planned. Renaming a site stays administrator-only; describing its
 * courts is part of planning.
 */
export async function updateSiteData(siteId: number, input: SiteData | null): Promise<void> {
  const site = await findSite(siteId)

  site.data = normalizeSiteData(input)
  await site.save()
}
