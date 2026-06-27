import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginForm from '@/app/(auth)/components/LoginForm'
import OrgNotFound from '@/app/(auth)/components/OrgNotFound'
import { getOrganization } from '@/app/services/organizations'

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ callbackUrl?: string; verified?: string; passwordReset?: string }>
}) {
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain') ?? ''

  // Root domain: no org context — redirect to landing.
  if (orgDomain === '__root__') {
    redirect('/')
  }

  // Unknown org: show an error instead of the login form.
  const organization = await getOrganization({ domainName: orgDomain })

  if (!organization) {
    return <OrgNotFound orgDomain={orgDomain} />
  }

  const { callbackUrl, verified, passwordReset } = await searchParams

  return (
    <LoginForm
      callbackUrl={callbackUrl ?? null}
      verified={verified === '1'}
      passwordReset={passwordReset === '1'}
      allowRegistrations={!!organization.allowedRegistrationRoles && organization.allowedRegistrationRoles.length > 0}
    />
  )
}
