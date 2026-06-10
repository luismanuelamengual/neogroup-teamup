import NextAuth from 'next-auth'

import { authConfig } from '@/auth.config'

/**
 * Route protection. Unauthenticated users are redirected to /login with a
 * callbackUrl, so tournament invite links keep working after signing in.
 */
export const proxy = NextAuth(authConfig).auth

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)']
}
