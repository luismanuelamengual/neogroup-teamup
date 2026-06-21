import './page.scss'
import Typography from '@mui/material/Typography'
import { getTranslations } from 'next-intl/server'
import RankingsBrowser from '@/app/(protected)/(rankings)/components/RankingsBrowser'

/** Rankings browser — identical for players and organizers. */
export default async function RankingsPage() {
  const t = await getTranslations('rankings')

  return (
    <div className="rankings-page">
      <div className="header">
        <Typography variant="h5" component="h1" className="title">
          {t('title')}
        </Typography>
        <Typography className="subtitle" color="text.secondary">
          {t('subtitle')}
        </Typography>
      </div>
      <RankingsBrowser />
    </div>
  )
}
