import { NextResponse } from 'next/server'
import { ServiceResult } from '@/app/_services/types'
import { auth } from '@/auth'

/** Helpers shared by the /api route handlers. */

/** Returns the signed-in user id, or null when there is no session. */
export async function getSessionUserId(): Promise<number | null> {
  const session = await auth()

  return session?.user?.id ? Number(session.user.id) : null
}

/** 401 JSON response. */
export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
}

/** Maps a ServiceResult to a JSON response with a proper HTTP status. */
export function serviceResponse(result: ServiceResult): NextResponse {
  let status = 200

  if (!result.success) {
    if (result.error === 'unauthorized') {
      status = 403
    } else if (result.error === 'notFound') {
      status = 404
    } else {
      status = 400
    }
  }

  return NextResponse.json(result, { status })
}
