import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserId, unauthorizedResponse } from '@/app/_utils/api-server'
import { searchTournaments } from '@/app/_utils/queries'

/** GET /api/tournaments/search?name= — searches joinable/visible tournaments by name. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const name = request.nextUrl.searchParams.get('name') ?? ''
  const tournaments = await searchTournaments(name)

  return NextResponse.json({ tournaments })
}
