import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import AccountForm from '@/app/(protected)/(account)/components/AccountForm'

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
      phoneNumber={session.user.phoneNumber ?? ''}
    />
  )
}
