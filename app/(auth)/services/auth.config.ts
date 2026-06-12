import type { NextAuthConfig } from 'next-auth'

const PUBLIC_PATHS = ['/login', '/register']

/**
 * Edge-safe Auth.js configuration (no database access) shared between
 * the proxy (route protection) and the full server-side configuration.
 */
export const authConfig = {
  pages: {
    signIn: '/login'
  },
  session: {
    strategy: 'jwt'
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
