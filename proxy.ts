import { NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/app/(auth)/services/auth.config'

const { auth } = NextAuth(authConfig)

/**
 * Resolves the organization domain slug from an HTTP Host header value.
 * Edge-safe: pure string manipulation, no DB access.
 *
 * - "teamup.ar" | "www.teamup.ar"  →  null  (root domain, no org)
 * - "club-aleman.teamup.ar"        →  "club-aleman"
 * - "localhost:3000"               →  DEV_ORGANIZATION_DOMAIN env var (or null)
 */
function resolveOrgDomain(host: string): string | null {
  if (!host || host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return process.env.DEV_ORGANIZATION_DOMAIN ?? null
  }

  const parts = host.split('.')

  // Root domain: "teamup.ar" (2 parts) or "www.teamup.ar" (3 parts, first === 'www')
  if (parts.length === 2 || (parts.length === 3 && parts[0] === 'www')) {
    return null
  }

  return parts[0] || null
}

/**
 * Middleware: resolves the organization from the subdomain, injects it as the
 * `x-org-domain` request header, then enforces authentication.
 *
 * Uses the next-auth v5 `auth(callback)` pattern: next-auth handles route
 * protection first (redirecting to /login when needed), then our callback runs
 * for every request that passes authorization and adds the org domain header.
 *
 * Note: the middleware runs on the Edge — it must stay free of Node.js-only
 * modules (no DB access). The actual organizationId lookup from the domain
 * name is done in the Node.js runtime inside each Server Component or API route.
 */
export const proxy = auth((request) => {
  const orgDomain = resolveOrgDomain(request.headers.get('host') ?? '')

  if (orgDomain) {
    const headers = new Headers(request.headers)

    headers.set('x-org-domain', orgDomain)

    return NextResponse.next({ request: { headers } })
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
}
