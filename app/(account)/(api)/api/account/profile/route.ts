import { User } from '@/app/(auth)/entities/User'
import { Profile } from '@/app/(auth)/models/user'
import { unstable_update } from '@/app/(auth)/services/auth'
import { apiResponse, withAuth } from '@/app/utils/api-server'

/** PUT /api/account/profile — sets the active profile (organizer / player). */
export const PUT = withAuth(async (request, context, userId) => {
  const { profile } = (await request.json()) as { profile: Profile }

  if (profile !== 'organizer' && profile !== 'player') {
    return apiResponse({ success: false, error: 'invalidProfile' })
  }

  const user = await User.find(userId)

  if (!user) {
    return apiResponse({ success: false, error: 'unauthorized' })
  }

  user.profile = profile
  await user.save()
  await unstable_update({})

  return apiResponse({ success: true })
})
