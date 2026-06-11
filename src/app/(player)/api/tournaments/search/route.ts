import { NextResponse } from 'next/server'
import { withAuth } from '@/app/_utils/api-server'
import { searchTournaments } from '@/app/_utils/queries'

/** GET /api/tournaments/search?name= — searches joinable/visible tournaments by name. */
export const GET = withAuth(async (request) => {
  const name = request.nextUrl.searchParams.get('name') ?? ''
  const tournaments = await searchTournaments(name)

  return NextResponse.json({ tournaments })
})
