import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginForm from '@/app/(auth)/components/LoginForm'
import { Organization } from '@/app/(auth)/models/Organization'
import OrgNotFound from '@/app/components/OrgNotFound'

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
