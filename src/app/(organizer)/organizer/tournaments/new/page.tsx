import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'

import TournamentForm from '@/app/(organizer)/organizer/tournaments/new/_components/TournamentForm'

export default async function NewTournamentPage() {
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
