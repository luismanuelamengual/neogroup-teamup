import { NextRequest, NextResponse } from 'next/server'
import { AccountInput, updateAccount } from '@/app/_services/account.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'
import { unstable_update } from '@/auth'

/** PATCH /api/account — updates the personal information of the signed-in user. */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const input = (await request.json()) as AccountInput
  const result = await updateAccount(userId, input)

  if (result.success) {
    await unstable_update({})
  }

  return serviceResponse(result)
}
