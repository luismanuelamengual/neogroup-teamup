import { CreateUserInput } from '@/app/(protected)/(users)/models/UserInput'
import { createUser } from '@/app/(protected)/(users)/services/users'
import { withAdmin } from '@/app/utils/api-server'

/**
 * POST /api/createUser — creates a user of the organization and emails them an
 * invitation to set their own password. Administrator only.
 */
export const POST = withAdmin(async (request, _context, _userId, organizationId) => {
  const input = (await request.json()) as CreateUserInput
  const user = await createUser(organizationId, input, request.headers.get('host') ?? '')

  return { id: user.id }
})
