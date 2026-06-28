import './index.scss'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { auth } from '@/app/(auth)/services/auth'
import AccountForm from '@/app/(protected)/(account)/components/AccountForm'
import MercadoPagoCard from '@/app/(protected)/(account)/components/MercadoPagoCard'
import { Role } from '@/app/models/Role'

export default async function AccountPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const isOrganizer = session.user.roleId === Role.ORGANIZER

  return (
    <div className="account-page">
      <AccountForm
        email={session.user.email ?? ''}
        firstName={session.user.firstName ?? ''}
        lastName={session.user.lastName ?? ''}
        nickname={session.user.nickname ?? ''}
        phoneNumber={session.user.phoneNumber ?? ''}
      />
      {isOrganizer && (
        <Suspense fallback={null}>
          <MercadoPagoCard />
        </Suspense>
      )}
    </div>
  )
}
