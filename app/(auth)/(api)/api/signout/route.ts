import { signOut } from '@/app/(auth)/services/auth'

/**
 * GET /api/signout
 *
 * Signs the current user out and redirects to /login.
 * Used by the protected layout when it detects an organization mismatch
 * (e.g. a session from org A trying to access org B's subdomain).
 *
 * Signing out requires clearing a cookie, which is only permitted in
 * Route Handlers and Server Actions — not in Server Component layouts.
 */
export async function GET() {
  await signOut({ redirectTo: '/login' })
}
