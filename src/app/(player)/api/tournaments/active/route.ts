import { NextResponse } from 'next/server'
import { getSessionUserId, unauthorizedResponse } from '@/app/_utils/api-server'
import { getPlayerActiveTournaments } from '@/app/_utils/queries'

/** GET /api/tournaments/active — tournaments where the signed-in user participates. */
export async function GET(): Promise<NextResponse> {
  const userId = await getSessionUserId()

  if (!userId) {
    return unauthorizedResponse()
  }

  const tournaments = await getPlayerActiveTournaments(userId)

  return NextResponse.json({ tournaments })
}
