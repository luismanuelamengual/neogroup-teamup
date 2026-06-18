import { NextRequest, NextResponse } from 'next/server'
import { Organization } from '@/app/(auth)/models/Organization'
import { auth } from '@/app/(auth)/services/auth'
import { ApiException } from '@/app/models/ApiException'
import { ApiResponse } from '@/app/models/ApiResponse'

/** Helpers shared by the /api route handlers. */

interface RouteContext<P> {
  params: Promise<P>
}

type ApiHandler<P> = (request: NextRequest, context: RouteContext<P>, organizationId: number) => Promise<unknown>
type AuthenticatedApiHandler<P> = (
  request: NextRequest,
  context: RouteContext<P>,
  userId: number,
  organizationId: number
) => Promise<unknown>

function successResponse(data: unknown): NextResponse {
  const body: ApiResponse = { success: true, data: data ?? null }

  return NextResponse.json(body)
}

function errorResponse(error: unknown): NextResponse {
  const isApiException = error instanceof ApiException
  const normalizedError = error instanceof Error ? error : new Error(String(error))
  const body: ApiResponse = {
    success: false,
    // Unexpected errors are masked with a stable "internalError" code.
    error: { name: normalizedError.name, message: isApiException ? error.message : 'internalError' } as Error
  }

  return NextResponse.json(body, { status: isApiException ? error.status : 500 })
}

/**
 * Resolves the organizationId from the x-org-domain header set by the middleware.
 * Falls back to DEFAULT_ORG_DOMAIN env var (default: "demo") for requests that
 * bypass the middleware (e.g. direct API calls in local dev without the header).
 */
async function resolveOrganizationId(request: NextRequest): Promise<number> {
  const orgDomain = request.headers.get('x-org-domain') ?? process.env.DEFAULT_ORG_DOMAIN ?? 'demo'
  const organization = await Organization.where('domainName', orgDomain).first()

  if (!organization) {
    throw new ApiException('organizationNotFound', 404)
  }

  return organization.id
}

/**
 * Wraps an API handler with the standard response shape: whatever the handler
 * returns is sent as `data`, and any thrown error becomes an error response.
 * Resolves and injects the organizationId from the current subdomain.
 */
export function withApi<P = Record<string, string>>(handler: ApiHandler<P>) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    try {
      const organizationId = await resolveOrganizationId(request)

      return successResponse(await handler(request, context, organizationId))
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
      const organizationId = await resolveOrganizationId(request)

      return successResponse(await handler(request, context, userId, organizationId))
    } catch (error) {
      return errorResponse(error)
    }
  }
}
