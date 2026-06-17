import type { NextAuthConfig } from 'next-auth'

const PUBLIC_PATHS = ['/login', '/register']
// Session timeout in seconds. Defaults to 30 days if not set.
const SESSION_MAX_AGE = process.env.AUTH_SESSION_MAX_AGE
  ? parseInt(process.env.AUTH_SESSION_MAX_AGE, 10)
  : 30 * 24 * 60 * 60

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
    authorized({ auth, request: { nextUrl } }) {
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
