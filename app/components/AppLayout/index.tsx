import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import UserStoreHydrator from '@/app/(auth)/components/UserStoreHydrator'
import { SessionUser, UserRoleId } from '@/app/(auth)/models/user'
import { auth } from '@/app/(auth)/services/auth'
import AppShell from '@/app/components/AppShell'

/**
 * Shared layout for every authenticated page: requires a session with an
 * assigned role, hydrates the user store and wraps the content with the
 * application shell.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
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
    roleId: session.user.roleId as UserRoleId
  }

  return (
    <>
      <UserStoreHydrator user={user} />
      <AppShell>{children}</AppShell>
    </>
  )
}
