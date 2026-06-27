import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import ForgotPasswordForm from '@/app/(auth)/components/ForgotPasswordForm'
import OrgNotFound from '@/app/(auth)/components/OrgNotFound'
import { getOrganization } from '@/app/services/organizations'

export default async function ForgotPasswordPage() {
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain') ?? ''

  if (orgDomain === '__root__') {
    redirect('/')
  }

  const organization = await getOrganization({ domainName: orgDomain })

  if (!organization) {
    return <OrgNotFound orgDomain={orgDomain} />
  }

  return <ForgotPasswordForm />
}
