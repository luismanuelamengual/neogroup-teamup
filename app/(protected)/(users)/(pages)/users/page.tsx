import './page.scss'
import Typography from '@mui/material/Typography'
import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import UsersBrowser from '@/app/(protected)/(users)/components/UsersBrowser'
import { Role } from '@/app/models/Role'

/** Users management (ABM) of the organization — administrators only. */
export default async function UsersPage() {
  const session = await auth()

  if (session?.user?.roleId !== Role.ADMINISTRATOR) {
    redirect('/home')
  }

  return (
    <div className="users-page">
      <div className="page-header">
        <Typography variant="h5" component="h1" className="title">
          Usuarios
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Administrá los usuarios de tu organización
        </Typography>
      </div>
      <UsersBrowser />
    </div>
  )
}
