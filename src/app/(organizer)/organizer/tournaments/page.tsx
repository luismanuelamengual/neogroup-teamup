import './page.styles.scss'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import OrganizerTournamentsList from '@/app/(organizer)/organizer/tournaments/_components/OrganizerTournamentsList'
import TournamentFilters from '@/app/(organizer)/organizer/tournaments/_components/TournamentFilters'

export default async function OrganizerTournamentsPage({
  searchParams
}: {
  searchParams: Promise<{ name?: string; active?: string }>
}) {
  const { name, active } = await searchParams
  const t = await getTranslations('organizer')

  return (
    <div className="organizer-tournaments">
      <div className="organizer-tournaments__header">
        <Typography variant="h5" component="h1" className="organizer-tournaments__title">
          {t('title')}
        </Typography>
        <Button component={Link} href="/organizer/tournaments/new" variant="contained" startIcon={<AddIcon />}>
          {t('create')}
        </Button>
      </div>
      <TournamentFilters name={name ?? ''} onlyActive={active === '1'} />
      <OrganizerTournamentsList name={name ?? ''} onlyActive={active === '1'} />
    </div>
  )
}
