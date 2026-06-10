import { redirect } from 'next/navigation'
import { ReactNode } from 'react'

import { auth } from '@/auth'
import AppShell from '@/app/_components/AppShell'

export default async function OrganizerLayout({ children }: { children: ReactNode }) {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (!session.user.profile) {
    redirect('/select-profile')
  }

  if (session.user.profile !== 'organizer') {
    redirect('/player/tournaments')
  }

  return (
    <AppShell profile="organizer" userName={session.user.name ?? ''} avatarUrl={session.user.image ?? ''}>
      {children}
    </AppShell>
  )
}
