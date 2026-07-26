import './page.scss'
import Typography from '@mui/material/Typography'
import { redirect } from 'next/navigation'
import { auth } from '@/app/(auth)/services/auth'
import CategoriesBrowser from '@/app/(protected)/(categories)/components/CategoriesBrowser'
import { Role } from '@/app/models/Role'

/** Categories management (ABM) of the organization — administrators only. */
export default async function CategoriesPage() {
  const session = await auth()

  if (session?.user?.roleId !== Role.ADMINISTRATOR) {
    redirect('/home')
  }

  return (
    <div className="categories-page">
      <div className="page-header">
        <Typography variant="h5" component="h1" className="title">
          Categorías
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Administrá las categorías que los organizadores pueden asignar a sus torneos
        </Typography>
      </div>
      <CategoriesBrowser />
    </div>
  )
}
