import { redirect } from 'next/navigation'
import { ReactNode } from 'react'

import { auth } from '@/auth'
import AppShell from '@/app/_components/AppShell'

/** Layout for pages shared by both profiles (e.g. My account). */
export default async function MainLayout({ children }: { children: ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (!session.user.profile) {
    redirect('/select-profile')
  }

  return (
    <AppShell
      profile={session.user.profile}
      userName={session.user.name ?? ''}
      avatarUrl={session.user.image ?? ''}
    >
      {children}
    </AppShell>
  )
}
