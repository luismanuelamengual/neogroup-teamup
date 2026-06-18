import { NextResponse } from 'next/server'
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
 * Uses the next-auth v5 `auth(callback)` pattern: next-auth handles route
 * protection first (redirecting to /login when needed), then our callback runs
 * for every request that passes authorization and adds the org domain header.
 *
 * Note: the middleware runs on the Edge — it must stay free of Node.js-only
 * modules (no DB access). The actual organizationId lookup from the domain
 * name is done in the Node.js runtime inside each API route handler.
 */
export const proxy = auth((request) => {
  const host = request.headers.get('host') ?? ''
  const orgDomain = resolveOrgDomain(host)
  const headers = new Headers(request.headers)

  headers.set('x-org-domain', orgDomain)

  return NextResponse.next({ request: { headers } })
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
}
