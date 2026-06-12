import { NextResponse } from 'next/server'
import { searchTournaments } from '@/app/(tournaments)/services/queries'
import { withAuth } from '@/app/utils/api-server'

/** GET /api/tournaments/search?name= — searches joinable/visible tournaments by name. */
export const GET = withAuth(async (request) => {
  const name = request.nextUrl.searchParams.get('name') ?? ''
  const tournaments = await searchTournaments(name)

  return NextResponse.json({ tournaments })
})
