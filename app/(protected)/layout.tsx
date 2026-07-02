import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ReactNode, Suspense } from 'react'
import UserStoreHydrator from '@/app/(auth)/components/UserStoreHydrator'
import { SessionUser } from '@/app/(auth)/models/SessionUser'
import { auth } from '@/app/(auth)/services/auth'
import AppShell from '@/app/(protected)/components/AppShell'
import Loading from '@/app/components/Loading'
import { Role } from '@/app/models/Role'
import { getOrganization, resolveOrganizationImage } from '@/app/services/organizations'

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
  // If they don't, sign them out entirely — a plain redirect to /login would
  // loop forever because the authorized callback would bounce them back to /.
  const headersList = await headers()
  const orgDomain = headersList.get('x-org-domain')
  const organization = orgDomain ? await getOrganization({ domainName: orgDomain }) : null

  if (!organization || session.user.organizationId !== organization.id) {
    // Writing cookies (required to clear the session) is not allowed in Server
    // Component layouts — only in Route Handlers and Server Actions. We redirect
    // to a dedicated Route Handler that calls signOut and then goes to /login.
    redirect('/api/signout')
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
      <AppShell user={user} logoSrc={resolveOrganizationImage(orgDomain, 'logo-bar.png')}>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </AppShell>
    </>
  )
}
