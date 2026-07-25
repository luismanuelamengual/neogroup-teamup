import { UpdateUserInput } from '@/app/(protected)/(users)/models/UserInput'
import { updateUser } from '@/app/(protected)/(users)/services/users'
import { ApiException } from '@/app/models/ApiException'
import { withAdmin } from '@/app/utils/api-server'

type UpdateUserBody = UpdateUserInput & { id: number }

/** POST /api/updateUser — updates a user of the organization. Administrator only. */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const { id, ...input } = (await request.json()) as UpdateUserBody

  if (!id) {
    throw new ApiException('missingFields')
  }

  await updateUser(organizationId, Number(id), input)

  return null
})
