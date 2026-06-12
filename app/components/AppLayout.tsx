import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { auth } from '@/app/(auth)/services/auth'
import AppShell from '@/app/components/AppShell'

/**
 * Shared layout for every authenticated page: requires a session and a
 * selected profile, and wraps the content with the application shell.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (!session.user.profile) {
    redirect('/select-profile')
  }

  return (
    <AppShell profile={session.user.profile} userName={session.user.name ?? ''} avatarUrl={session.user.image ?? ''}>
      {children}
    </AppShell>
  )
}
