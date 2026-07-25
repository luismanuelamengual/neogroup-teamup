import './page.scss'
import Typography from '@mui/material/Typography'
import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import SitesBrowser from '@/app/(protected)/(sites)/components/SitesBrowser'
import { Role } from '@/app/models/Role'

/** Sites management (ABM) of the organization — administrators only. */
export default async function SitesPage() {
  const session = await auth()

  if (session?.user?.roleId !== Role.ADMINISTRATOR) {
    redirect('/home')
  }

  return (
    <div className="sites-page">
      <div className="page-header">
        <Typography variant="h5" component="h1" className="title">
          Sedes
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Administrá las sedes donde se juegan los torneos de tu organización
        </Typography>
      </div>
      <SitesBrowser />
    </div>
  )
}
