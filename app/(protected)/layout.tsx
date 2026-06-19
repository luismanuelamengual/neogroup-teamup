import { redirect } from 'next/navigation'
import { ReactNode, Suspense } from 'react'
import UserStoreHydrator from '@/app/(auth)/components/UserStoreHydrator'
import { Role } from '@/app/(auth)/models/Role'
import { SessionUser } from '@/app/(auth)/models/SessionUser'
import { auth } from '@/app/(auth)/services/auth'
import AppShell from '@/app/(protected)/components/AppShell'
import Loading from '@/app/components/Loading'

/**
 * Shared layout for every authenticated page: requires a session with an
 * assigned role, hydrates the user store and wraps the content with the
 * application shell.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (!session.user.roleId) {
    redirect('/select-role')
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
