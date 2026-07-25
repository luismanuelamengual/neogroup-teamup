import { CategoryInput } from '@/app/(protected)/(categories)/models/CategoryInput'
import { createCategory } from '@/app/(protected)/(categories)/services/categories'
import { withAdmin } from '@/app/utils/api-server'

/** POST /api/createCategory — creates a category of the organization. Administrator only. */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const input = (await request.json()) as CategoryInput
  const category = await createCategory(organizationId, input)

  return { id: category.id }
})
