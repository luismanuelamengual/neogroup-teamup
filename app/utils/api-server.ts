import * as Sentry from '@sentry/nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/services/auth'
import { ApiException } from '@/app/models/ApiException'
import { ApiResponse } from '@/app/models/ApiResponse'
import { Role } from '@/app/models/Role'
import { withOrganization } from '@/app/services/organization-context'
import { getOrganization } from '@/app/services/organizations'
import { isProduction } from '@/app/utils/environment'

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
  // Unexpected errors are masked with a stable "internalError" code in
  // production, so a real cause (a bad query, a misconfigured integration)
  // never leaks to end users. Outside production the real message is sent
  // instead, so staging/preview deploys are debuggable from the FE response
  // alone instead of requiring server-log access.
  const maskedMessage = isProduction ? 'Internal Error' : normalizedError.message
  const body: ApiResponse = {
    success: false,
    error: { name: normalizedError.name, message: isApiException ? error.message : maskedMessage } as Error
  }

  // Unexpected (non-ApiException) errors are masked in the response, so log
  // the real cause to the server console AND report it to Sentry — this is
  // the only place that swallows these errors before they reach Next.js'
  // own request-error instrumentation, so without an explicit report here
  // they would never show up in Sentry at all.
  if (!isApiException) {
    // eslint-disable-next-line no-console
    console.error('[api] Unhandled error:', normalizedError)
    Sentry.captureException(normalizedError)
  }

  return NextResponse.json(body, { status: isApiException ? error.status : 500 })
}

/**
 * Resolves the organizationId for the current request.
 *
 * API routes (/api/*) are excluded from the middleware matcher, so the
 * x-org-domain header is never present here. We resolve the organization
 * directly from the Host header — safe because api-server runs in Node.js
 * runtime (no Edge restriction).
 */
async function resolveOrganizationId(request: NextRequest): Promise<number> {
  const organization = await getOrganization({ host: request.headers.get('host') ?? '' })

  if (!organization) {
    throw new ApiException('Organización no encontrada', 404)
  }

  return organization.id
}

/**
 * Wraps an API handler with the standard response shape: whatever the handler
 * returns is sent as `data`, and any thrown error becomes an error response.
 * Resolves and injects the organizationId from the current subdomain.
 *
 * The handler also runs inside that organization's context (see
 * `services/organization-context.ts`), so the organization-scoped models filter
 * by the same tenant the handler was handed — the subdomain being served —
 * rather than re-deriving it from the session on their own. One request, one
 * answer to "which organization is this".
 */
export function withApi<P = Record<string, string>>(handler: ApiHandler<P>) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    try {
      const organizationId = await resolveOrganizationId(request)

      return successResponse(await withOrganization(organizationId, () => handler(request, context, organizationId)))
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
      return errorResponse(new ApiException('Usuario no autenticado', 401))
    }

    try {
      const organizationId = await resolveOrganizationId(request)

      return successResponse(
        await withOrganization(organizationId, () => handler(request, context, userId, organizationId))
      )
    } catch (error) {
      return errorResponse(error)
    }
  }
}

/**
 * Same as withAuth, but additionally requires the signed-in user to manage the
 * organization — an organizer or the administrator (403 otherwise). Used by the
 * payments module: settling TeamUp's service fee is an organization matter, and
 * both profiles see and can pay the whole debt.
 */
export function withOrganizerOrAdmin<P = Record<string, string>>(handler: AuthenticatedApiHandler<P>) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    const session = await auth()
    const userId = session?.user?.id ? Number(session.user.id) : null

    if (!userId) {
      return errorResponse(new ApiException('Usuario no autenticado', 401))
    }

    const roleId = session?.user?.roleId

    if (roleId !== Role.ADMINISTRATOR && roleId !== Role.ORGANIZER) {
      return errorResponse(new ApiException('Operación no autorizada', 403))
    }

    try {
      const organizationId = await resolveOrganizationId(request)

      return successResponse(
        await withOrganization(organizationId, () => handler(request, context, userId, organizationId))
      )
    } catch (error) {
      return errorResponse(error)
    }
  }
}

/**
 * Same as withAuth, but additionally requires the signed-in user to be the
 * organization administrator (403 otherwise). Used by every endpoint of the
 * users management module.
 */
export function withAdmin<P = Record<string, string>>(handler: AuthenticatedApiHandler<P>) {
  return async (request: NextRequest, context: RouteContext<P>): Promise<NextResponse> => {
    const session = await auth()
    const userId = session?.user?.id ? Number(session.user.id) : null

    if (!userId) {
      return errorResponse(new ApiException('Usuario no autenticado', 401))
    }

    if (session?.user?.roleId !== Role.ADMINISTRATOR) {
      return errorResponse(new ApiException('Operación no autorizada', 403))
    }

    try {
      const organizationId = await resolveOrganizationId(request)

      return successResponse(
        await withOrganization(organizationId, () => handler(request, context, userId, organizationId))
      )
    } catch (error) {
      return errorResponse(error)
    }
  }
}
