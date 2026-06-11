import { NextRequest, NextResponse } from 'next/server'
import { RegisterInput, registerUser } from '@/app/_services/account.service'
import { searchUsers } from '@/app/_services/registration.service'
import { getSessionUserId, serviceResponse, unauthorizedResponse } from '@/app/_utils/api-server'

/** POST /api/users — creates a new user with email/password credentials (public). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const input = (await request.json()) as RegisterInput

  return serviceResponse(await registerUser(input))
}

/** GET /api/users?q= — searches users by name, nickname or email (partner selection). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const query = request.nextUrl.searchParams.get('q') ?? ''
  const users = await searchUsers(userId, query)

  return NextResponse.json({ users })
}
