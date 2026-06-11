import { NextResponse } from 'next/server'
import { withAuth } from '@/app/_utils/api-server'
import { getPlayerActiveTournaments } from '@/app/_utils/queries'

/** GET /api/tournaments/active — tournaments where the signed-in user participates. */
export const GET = withAuth(async (request, context, userId) => {
  const tournaments = await getPlayerActiveTournaments(userId)

  return NextResponse.json({ tournaments })
})
