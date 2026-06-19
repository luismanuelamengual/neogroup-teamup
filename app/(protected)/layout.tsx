import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ReactNode, Suspense } from 'react'
import UserStoreHydrator from '@/app/(auth)/components/UserStoreHydrator'
import { Organization } from '@/app/(auth)/models/Organization'
import { Role } from '@/app/(auth)/models/Role'
import { SessionUser } from '@/app/(auth)/models/SessionUser'
import { auth } from '@/app/(auth)/services/auth'
import AppShell from '@/app/(protected)/components/AppShell'
import Loading from '@/app/components/Loading'

/**
 * Shared layout for every authenticated page: requires a session with an
 * assigned role, hydrates the user store and wraps the content with the
 * application shell.
 *
 * Also enforces organization isolation: if the session user belongs to a
 * different organization than the current subdomain, they are redirected to
 * /login so they cannot access another org's data.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (!session.user.roleId) {
    redirect('/select-role')
  }

  // Verify the logged-in user belongs to the organization of the current subdomain.
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain') ?? ''
  const organization = await Organization.where('domainName', orgDomain).first()

  if (!organization || session.user.organizationId !== organization.id) {
    redirect('/login')
  }

  const user: SessionUser = {
    id: Number(session.user.id),
    email: session.user.email ?? '',
    firstName: session.user.firstName,
    lastName: session.user.lastName,
    nickname: session.user.nickname,
    displayName: session.user.name ?? '',
    avatarUrl: session.user.image ?? '',
    roleId: session.user.roleId as Role
  }

  return (
    <>
      <UserStoreHydrator user={user} />
      <AppShell user={user}>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </AppShell>
    </>
  )
}
