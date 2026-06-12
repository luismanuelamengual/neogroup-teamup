import { NextResponse } from 'next/server'
import { getPlayerActiveTournaments } from '@/app/(tournaments)/services/queries'
import { withAuth } from '@/app/utils/api-server'

/** GET /api/tournaments/active — tournaments where the signed-in user participates. */
export const GET = withAuth(async (request, context, userId) => {
  const tournaments = await getPlayerActiveTournaments(userId)

  return NextResponse.json({ tournaments })
})
