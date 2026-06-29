import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import RoleSelector from '@/app/(auth)/components/RoleSelector'
import { auth } from '@/app/(auth)/services/auth'
import { getOrganization } from '@/app/services/organizations'

/** One-time role selection for users signing in without an assigned role (e.g. first Google login). */
export default async function SelectRolePage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.roleId) {
    redirect('/')
  }

  const headersList = await headers()
  const organization = await getOrganization({ host: headersList.get('host') ?? '' })
  const allowedRoles = organization?.allowedRegistrationRoles ?? []

  return <RoleSelector callbackUrl={callbackUrl ?? null} allowedRoles={allowedRoles} />
}
