import { SiteData } from '@/app/(protected)/(sites)/models/SiteData'
import { updateSiteData } from '@/app/(protected)/(sites)/services/sites'
import { ApiException } from '@/app/models/ApiException'
import { withOrganizerOrAdmin } from '@/app/utils/api-server'

type UpdateSiteDataBody = { id: number; data: SiteData | null }

/**
 * POST /api/updateSiteData — stores the settings of a venue (courts setup and
 * the duration it was last planned with).
 *
 * Unlike /api/updateSite this one is not administrator-only: it is written by
 * the organizer's planner on every change. Naming a venue is administration;
 * describing how many courts it has is planning.
 */
export const POST = withOrganizerOrAdmin(async (request, _context, _userId, organizationId) => {
  const { id, data } = (await request.json()) as UpdateSiteDataBody

  if (!id) {
    throw new ApiException('missingFields')
  }

  await updateSiteData(organizationId, Number(id), data ?? null)

  return null
})
