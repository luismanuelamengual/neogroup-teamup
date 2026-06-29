import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import LandingPage from './(public)/components/LandingPage'
import { getOrganization } from './services/organizations'

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

  // Root domain (teamup.ar) or unknown subdomain: show public landing.
  if (!orgDomain) {
    return <LandingPage />
  }

  const organization = await getOrganization({ domainName: orgDomain })

  if (!organization) {
    // Unknown subdomain: redirect to the root domain so the URL changes too.
    // e.g. "rama.teamup.ar" → "https://teamup.ar"
    // Falls back to rendering the landing inline for local dev (no real root domain).
    const host = headersList.get('host') ?? ''
    const parts = host.split('.')
    const rootDomain = parts.length >= 3 ? parts.slice(1).join('.') : null

    if (rootDomain) {
      redirect(`https://${rootDomain}`)
    }

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

  redirect('/home')
}
