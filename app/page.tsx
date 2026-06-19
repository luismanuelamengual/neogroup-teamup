import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import LandingPage from '@/app/components/LandingPage'

/**
 * Entry point: routes the user to the right home depending on the session,
 * the selected profile and an optional callbackUrl (e.g. invite links).
 *
 * When accessed from the root domain (teamup.ar, no subdomain) the public
 * landing page is rendered regardless of auth state.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain')

  // Root domain (teamup.ar): show public landing, no auth required.
  if (orgDomain === '__root__') {
    return <LandingPage />
  }

  const { callbackUrl } = await searchParams
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (!session.user.roleId) {
    redirect(`/select-role${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`)
  }

  if (callbackUrl && callbackUrl.startsWith('/')) {
    redirect(callbackUrl)
  }

  redirect('/tournaments')
}
