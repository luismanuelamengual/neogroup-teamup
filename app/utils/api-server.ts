import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/services/auth'
import { ApiResponse } from '@/app/models/api'

/** Helpers shared by the /api route handlers. */

interface RouteContext<P> {
  params: Promise<P>
}

type ApiHandler<P> = (request: NextRequest, context: RouteContext<P>) => Promise<unknown>
type AuthenticatedApiHandler<P> = (request: NextRequest, context: RouteContext<P>, userId: number) => Promise<unknown>

/**
 * Error to be thrown inside API handlers. `errorMessage` is a stable code the
 * FE can map to a translation; `status` is the HTTP status of the response.
 */
export class ApiException extends Error {
  constructor(public errorMessage: string, public status = 400) {
    super(errorMessage)
    this.name = 'ApiException'
  }
}

function successResponse(data: unknown): NextResponse {
  const body: ApiResponse = { success: true, data: data ?? null }

  return NextResponse.json(body)
}

function errorResponse(error: unknown): NextResponse {
  const isApiException = error instanceof ApiException
  const normalizedError = error instanceof Error ? error : new Error(String(error))
  const body: ApiResponse = {
    success: false,
    errorMessage: isApiException ? error.errorMessage : 'internalError',
    error: { name: normalizedError.name, message: normalizedError.message } as Error
  }

  return NextResponse.json(body, { status: isApiException ? error.status : 500 })
}

/**
 * Wraps an API handler with the standard response shape: whatever the handler
 * returns is sent as `data`, and any thrown error becomes an error response.
 */
export function withApi<P = Record<string, string>>(handler: ApiHandler<P>) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    try {
      return successResponse(await handler(request, context))
    } catch (error) {
      return errorResponse(error)
    }
  }
}

/** Same as withApi, but requires a signed-in user (401 otherwise). */
export function withAuth<P = Record<string, string>>(handler: AuthenticatedApiHandler<P>) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    const session = await auth()
    const userId = session?.user?.id ? Number(session.user.id) : null

    if (!userId) {
      return errorResponse(new ApiException('unauthorized', 401))
    }

    try {
      return successResponse(await handler(request, context, userId))
    } catch (error) {
      return errorResponse(error)
    }
  }
}
