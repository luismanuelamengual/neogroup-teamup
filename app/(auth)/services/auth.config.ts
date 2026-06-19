import type { NextAuthConfig } from 'next-auth'

const PUBLIC_PATHS = ['/login', '/register', '/public']
// Session timeout in seconds. Defaults to 30 days if not set.
const SESSION_MAX_AGE = process.env.AUTH_SESSION_MAX_AGE
  ? parseInt(process.env.AUTH_SESSION_MAX_AGE, 10)
  : 30 * 24 * 60 * 60

/**
 * Returns true when the request comes from the root domain (e.g. "teamup.ar")
 * with no subdomain. Duplicated from proxy.ts to keep the Edge-safe config
 * self-contained (no shared imports between edge and Node runtimes).
 */
function isRootDomain(host: string): boolean {
  if (!host || host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    return false
  }

  return host.split('.').length === 2
}

/**
 * Edge-safe Auth.js configuration (no database access) shared between
 * the proxy (route protection) and the full server-side configuration.
 */
export const authConfig = {
  pages: {
    signIn: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl, headers } }) {
      const host = headers.get('host') ?? ''

      // Root domain (teamup.ar without subdomain): always allow — the page.tsx
      // server component will render the public landing page.
      if (isRootDomain(host)) {
        return true
      }

      const isLoggedIn = !!auth?.user
      const isPublicPath = PUBLIC_PATHS.some((path) => nextUrl.pathname.startsWith(path))

      if (isPublicPath) {
        if (isLoggedIn) {
          return Response.redirect(new URL('/', nextUrl))
        }

        return true
      }

      return isLoggedIn
    }
  }
} satisfies NextAuthConfig
