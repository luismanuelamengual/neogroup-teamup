import './page.scss'
import RankingsBrowser from '@/app/(protected)/(rankings)/components/RankingsBrowser'

/** Rankings browser — identical for players and organizers. */
export default async function RankingsPage() {
  return (
    <div className="rankings-page">
      <RankingsBrowser />
    </div>
  )
}
