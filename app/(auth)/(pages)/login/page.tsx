import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginForm from '@/app/(auth)/components/LoginForm'
import OrgNotFound from '@/app/(auth)/components/OrgNotFound'
import { Organization } from '@/app/(auth)/models/Organization'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain') ?? ''

  // Root domain: no org context — redirect to landing.
  if (orgDomain === '__root__') {
    redirect('/')
  }

  // Unknown org: show an error instead of the login form.
  const organization = await Organization.where('domainName', orgDomain).first()

  if (!organization) {
    return <OrgNotFound orgDomain={orgDomain} />
  }

  const { callbackUrl } = await searchParams

  return <LoginForm callbackUrl={callbackUrl ?? null} />
}
