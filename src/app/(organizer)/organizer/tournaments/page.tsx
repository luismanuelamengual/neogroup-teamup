import './page.styles.scss'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import TournamentCard from '@/app/_components/tournament/TournamentCard'
import { getOrganizerTournaments } from '@/app/_utils/queries'
import TournamentFilters from '@/app/(organizer)/organizer/tournaments/_components/TournamentFilters'
import { auth } from '@/auth'

export default async function OrganizerTournamentsPage({
  searchParams
}: {
  searchParams: Promise<{ name?: string; active?: string }>
}) {
  const { name, active } = await searchParams
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const t = await getTranslations('organizer')
  const tournaments = await getOrganizerTournaments(Number(session.user.id), {
    name: name ?? undefined,
    onlyActive: active === '1'
  })

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
      {tournaments.length === 0 ? (
        <Typography color="text.secondary" className="organizer-tournaments__empty">
          {t('empty')}
        </Typography>
      ) : (
        <div className="organizer-tournaments__list">
          {tournaments.map((tournament) => (
            <TournamentCard
              key={tournament.id}
              tournament={tournament}
              href={`/organizer/tournaments/${tournament.id}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
