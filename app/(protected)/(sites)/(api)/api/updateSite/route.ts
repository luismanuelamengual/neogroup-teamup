import { SiteInput } from '@/app/(protected)/(sites)/models/SiteInput'
import { updateSite } from '@/app/(protected)/(sites)/services/sites'
import { ApiException } from '@/app/models/ApiException'
import { withAdmin } from '@/app/utils/api-server'

type UpdateSiteBody = SiteInput & { id: number }

/** POST /api/updateSite — renames a site of the organization. Administrator only. */
export const POST = withAdmin(async (request) => {
  const { id, ...input } = (await request.json()) as UpdateSiteBody

  if (!id) {
    throw new ApiException('missingFields')
  }

  await updateSite(Number(id), input)

  return null
})
