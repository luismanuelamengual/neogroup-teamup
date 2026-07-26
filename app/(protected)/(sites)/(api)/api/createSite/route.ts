import { SiteInput } from '@/app/(protected)/(sites)/models/SiteInput'
import { createSite } from '@/app/(protected)/(sites)/services/sites'
import { withAdmin } from '@/app/utils/api-server'

/** POST /api/createSite — creates a site of the organization. Administrator only. */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const input = (await request.json()) as SiteInput
  const site = await createSite(organizationId, input)

  return { id: site.id }
})
