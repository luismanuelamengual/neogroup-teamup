import { redirect } from 'next/navigation'
import AccountForm from '@/app/(account)/components/AccountForm'
import { auth } from '@/app/(auth)/services/auth'

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
    />
  )
}
