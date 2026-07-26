import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { getCategories } from '@/app/(protected)/(tournaments)/services/categories'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/getCategories — categories of the organization for a discipline.
 * Powers the category autocomplete in the tournament form.
 */
export const POST = withAuth(async (request) => {
  const { discipline } = (await request.json()) as { discipline?: Discipline }

  if (!discipline) {
    throw new ApiException('missingFields')
  }

  return getCategories({ discipline })
})
