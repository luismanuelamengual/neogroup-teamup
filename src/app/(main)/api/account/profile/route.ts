import { NextRequest, NextResponse } from 'next/server'
import { Profile } from '@/app/_models/types'
import { setProfile } from '@/app/_services/account.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'
import { unstable_update } from '@/auth'

/** PUT /api/account/profile — sets the active profile (organizer / player). */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const { profile } = (await request.json()) as { profile: Profile }
  const result = await setProfile(userId, profile)

  if (result.success) {
    await unstable_update({})
  }

  return serviceResponse(result)
}
