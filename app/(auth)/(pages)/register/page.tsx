import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import OrgNotFound from '@/app/(auth)/components/OrgNotFound'
import RegisterForm from '@/app/(auth)/components/RegisterForm'
import { Organization } from '@/app/(auth)/models/Organization'

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain') ?? ''

  // Root domain: no org context — redirect to landing.
  if (orgDomain === '__root__') {
    redirect('/')
  }

  // Unknown org: show an error instead of the register form.
  const organization = await Organization.where('domainName', orgDomain).first()

  if (!organization) {
    return <OrgNotFound orgDomain={orgDomain} />
  }

  const { callbackUrl } = await searchParams

  return <RegisterForm callbackUrl={callbackUrl ?? null} />
}
