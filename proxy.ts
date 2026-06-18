import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/app/(auth)/services/auth.config'

const { auth } = NextAuth(authConfig)

/**
 * Resolves the organization domain from the incoming request host.
 *
 * - Production:  club-aleman.teamup.ar  →  "club-aleman"
 * - Local dev:   localhost:3000          →  DEFAULT_ORG_DOMAIN env var (defaults to "demo")
 */
function resolveOrgDomain(host: string): string {
  if (!host || host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return process.env.DEFAULT_ORG_DOMAIN ?? 'demo'
  }

  // e.g. "club-aleman.teamup.ar" → "club-aleman"
  const subdomain = host.split('.')[0]

  return subdomain || (process.env.DEFAULT_ORG_DOMAIN ?? 'demo')
}

/**
 * Middleware: resolves the organization from the subdomain, injects it as the
 * `x-org-domain` request header, then enforces authentication.
 *
 * The org domain header is read downstream by `withAuth` / `withApi` in
 * `app/utils/api-server.ts` to filter data by organization.
 *
 * Note: the middleware runs on the Edge — it must stay free of Node.js-only
 * modules (no DB access). The actual organizationId lookup from the domain
 * name is done in the Node.js runtime inside each API route handler.
 */
export async function proxy(request: NextRequest): Promise<Response> {
  const host = request.headers.get('host') ?? ''
  const orgDomain = resolveOrgDomain(host)
  // Run the NextAuth auth check. Returns a redirect Response when the user is
  // not authorized, or undefined when the request can proceed.
  const authResponse = await auth(request as Parameters<typeof auth>[0])

  if (authResponse) {
    // Auth redirected the request (e.g. → /login or → /). Pass it through.
    return authResponse
  }

  // Auth passed — forward request with the org domain header injected.
  const headers = new Headers(request.headers)

  headers.set('x-org-domain', orgDomain)

  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
}
