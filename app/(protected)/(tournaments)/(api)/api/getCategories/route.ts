import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { getCategories } from '@/app/(protected)/(tournaments)/services/categories'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/getCategories — categories of the organization for a discipline /
 * sub-discipline. Powers the category autocomplete in the tournament form.
 */
export const POST = withAuth(async (request, _context, _userId, organizationId) => {
  const { discipline, subDiscipline } = (await request.json()) as {
    discipline?: Discipline
    subDiscipline?: SubDiscipline | null
  }

  if (!discipline) {
    throw new ApiException('missingFields')
  }

  return getCategories({ organizationId, discipline, subDiscipline: subDiscipline ?? null })
})
