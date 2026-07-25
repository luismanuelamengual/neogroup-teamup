import { CategoryInput } from '@/app/(protected)/(categories)/models/CategoryInput'
import { updateCategory } from '@/app/(protected)/(categories)/services/categories'
import { ApiException } from '@/app/models/ApiException'
import { withAdmin } from '@/app/utils/api-server'

type UpdateCategoryBody = CategoryInput & { id: number }

/** POST /api/updateCategory — updates a category of the organization. Administrator only. */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const { id, ...input } = (await request.json()) as UpdateCategoryBody

  if (!id) {
    throw new ApiException('missingFields')
  }

  await updateCategory(organizationId, Number(id), input)

  return null
})
