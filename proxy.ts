import { NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authConfig } from '@/app/(auth)/services/auth.config'
import { resolveOrganizationDomain } from '@/app/utils/organizations'

const { auth } = NextAuth(authConfig)

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
  const orgDomain = resolveOrganizationDomain(request.headers.get('host') ?? '')

  if (orgDomain) {
    const headers = new Headers(request.headers)

    headers.set('x-org-domain', orgDomain)

    return NextResponse.next({ request: { headers } })
  }

  return NextResponse.next()
})

export const config = {
  // `~offline` is excluded so the PWA offline fallback renders for everyone,
  // logged in or not, and the service worker precaches the page itself (not a
  // login redirect). `serwist/*` and `manifest.webmanifest` already match the
  // `.*\..*` exclusion (they contain a dot).
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|~offline|.*\\..*).*)']
}
