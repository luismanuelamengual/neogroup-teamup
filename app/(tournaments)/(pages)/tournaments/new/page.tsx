import Typography from '@mui/material/Typography'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { UserRoles } from '@/app/(auth)/models/UserRoles'
import { auth } from '@/app/(auth)/services/auth'
import TournamentForm from '@/app/(tournaments)/components/TournamentForm'

/** Tournament creation (organizer only). */
export default async function NewTournamentPage() {
  const session = await auth()

  if (session?.user?.roleId !== UserRoles.ORGANIZER) {
    redirect('/tournaments')
  }

  const t = await getTranslations('organizer')

  return (
    <div>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        {t('newTournamentTitle')}
      </Typography>
      <TournamentForm />
    </div>
  )
}
