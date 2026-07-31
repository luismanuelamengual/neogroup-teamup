import './page.scss'
import Typography from '@mui/material/Typography'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { auth } from '@/app/(auth)/services/auth'
import PaymentsBrowser from '@/app/(protected)/(payments)/components/PaymentsBrowser'
import { Role } from '@/app/models/Role'

/**
 * Service fee settlement page — organizers and administrators only. Both see
 * the whole organization's debt and can pay it.
 */
export default async function PaymentsPage() {
  const session = await auth()
  const roleId = session?.user?.roleId

  if (roleId !== Role.ADMINISTRATOR && roleId !== Role.ORGANIZER) {
    redirect('/home')
  }

  return (
    <div className="payments-page">
      <div className="page-header">
        <Typography variant="h5" component="h1" className="title">
          Pagos
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Torneos con inscripción paga que ya comenzaron y todavía no abonaste a TeamUp
        </Typography>
      </div>
      <Suspense fallback={null}>
        <PaymentsBrowser />
      </Suspense>
    </div>
  )
}
