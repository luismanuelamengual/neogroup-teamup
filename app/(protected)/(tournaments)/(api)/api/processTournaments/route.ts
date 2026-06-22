import { NextRequest, NextResponse } from 'next/server'
import { processTournaments } from '@/app/(protected)/(tournaments)/services/tournaments'

/**
 * GET /api/processTournaments
 *
 * Vercel Cron Job endpoint. Secured by the CRON_SECRET environment variable
 * (set as Authorization: Bearer <secret> in vercel.json).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processTournaments()

  return NextResponse.json({ ok: true, ...result })
}
