import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import RegisterForm from '@/app/(auth)/components/RegisterForm'
import { Organization } from '@/app/models/Organization'

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain')

  // Root domain: no org context — redirect to landing.
  if (!orgDomain) {
    redirect('/')
  }

  // Unknown org: show an error instead of the register form.
  const organization = await Organization.where('domainName', orgDomain).first()

  if (!organization) {
    redirect('/')
  }

  // No roles allowed to self-register — redirect to login.
  if (organization.allowedRegistrationRoles.length === 0) {
    redirect('/login')
  }

  const { callbackUrl } = await searchParams

  return (
    <RegisterForm callbackUrl={callbackUrl ?? null} allowedRegistrationRoles={organization.allowedRegistrationRoles} />
  )
}
