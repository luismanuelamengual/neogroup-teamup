import { AccountInput } from '@/app/(account)/models/account'
import { User } from '@/app/(auth)/entities/User'
import { unstable_update } from '@/app/(auth)/services/auth'
import { apiResponse, withAuth } from '@/app/utils/api-server'

/** PATCH /api/account — updates the personal information of the signed-in user. */
export const PATCH = withAuth(async (request, context, userId) => {
  const input = (await request.json()) as AccountInput
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()

  if (!firstName || !lastName) {
    return apiResponse({ success: false, error: 'missingFields' })
  }

  const user = await User.find(userId)

  if (!user) {
    return apiResponse({ success: false, error: 'unauthorized' })
  }

  user.firstName = firstName
  user.lastName = lastName
  user.nickname = input.nickname.trim() || null
  await user.save()
  await unstable_update({})

  return apiResponse({ success: true })
})
