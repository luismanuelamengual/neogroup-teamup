import { NextRequest, NextResponse } from 'next/server'
import { ApiResult } from '@/app/_models/api'
import { auth } from '@/auth'

/** Helpers shared by the /api route handlers. */

interface RouteContext<P> {
  params: Promise<P>
}

type AuthenticatedHandler<P> = (request: NextRequest, context: RouteContext<P>, userId: number) => Promise<NextResponse>

/**
 * Wraps a route handler with the session check: responds 401 when there is
 * no signed-in user, otherwise invokes the handler with the user id.
 */
export function withAuth<P = Record<string, string>>(handler: AuthenticatedHandler<P>) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    const session = await auth()
    const userId = session?.user?.id ? Number(session.user.id) : null

    if (!userId) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
    }

    return handler(request, context, userId)
  }
}

/** Maps an ApiResult to a JSON response with a proper HTTP status. */
export function apiResponse(result: ApiResult): NextResponse {
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
