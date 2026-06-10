import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import AccountForm from '@/app/(main)/account/_components/AccountForm'

export default async function AccountPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <AccountForm
      email={session.user.email ?? ''}
      firstName={session.user.firstName ?? ''}
      lastName={session.user.lastName ?? ''}
      nickname={session.user.nickname ?? ''}
      avatarUrl={session.user.image ?? ''}
    />
  )
}
