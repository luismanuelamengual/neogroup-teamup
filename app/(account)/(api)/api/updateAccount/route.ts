import { Repository } from '@neogroup/neorm'
import { AccountInput } from '@/app/(account)/actions/account'
import { User } from '@/app/(auth)/models/User'
import { unstable_update } from '@/app/(auth)/services/auth'
import { ApiException } from '@/app/models/ApiException'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/updateAccount — updates the personal information of the signed-in user. */
export const POST = withAuth(async (request, context, userId) => {
  const input = (await request.json()) as AccountInput
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!firstName || !lastName) {
    throw new ApiException('missingFields')
  }

  const user = await Repository.get(User).find(userId)

  if (!user) {
    throw new ApiException('unauthorized', 401)
  }

  user.firstName = firstName
  user.lastName = lastName
  user.nickname = input.nickname.trim() || null
  await Repository.get(User).save(user)
  await unstable_update({})
})
