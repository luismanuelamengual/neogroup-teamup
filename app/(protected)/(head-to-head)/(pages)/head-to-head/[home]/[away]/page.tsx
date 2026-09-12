import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/app/(auth)/services/auth'
import HeadToHeadView, { HeadToHeadPlayer } from '@/app/(protected)/(head-to-head)/components/HeadToHeadView'
import { parseHeadToHeadSide } from '@/app/(protected)/(head-to-head)/utils/headToHead'
import { getPlayers } from '@/app/(protected)/(tournaments)/services/players'
import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { getUserDisplayName, getUserShortName } from '@/app/utils/users'

/**
 * Head-to-head between two sides: /head-to-head/{sideA}/{sideB}.
 *
 * Each segment is the side's roster of player ids — a single id for singles
 * ("/head-to-head/1/5") and the comma-separated pair/team for everything else
 * ("/head-to-head/1,2/5,6"). Players, not competitors, because a competitor
 * only exists inside one tournament category while the history spans them all.
 *
 * The two sides are resolved here rather than by the view: they are what the
 * URL names, so the page can title itself even when the pair has never met —
 * which is exactly the case a player opens before a match they are about to
 * play. The encounters themselves are fetched by the view.
 *
 * Reached from the match detail, and identical for players and organizers.
 */
export default async function HeadToHeadPage({ params }: { params: Promise<{ home: string; away: string }> }) {
  const { home, away } = await params
  const session = await getSession()

  // Administrators manage users, not competition: this page is not part of their navigation.
  if (session?.user?.roleId === Role.ADMINISTRATOR) {
    redirect('/home')
  }

  const homePlayerIds = parseHeadToHeadSide(home)
  const awayPlayerIds = parseHeadToHeadSide(away)

  // A hand-typed or truncated URL never reaches the view: without two well
  // formed, distinct rosters there is no head-to-head to ask for.
  if (!homePlayerIds || !awayPlayerIds) {
    notFound()
  }

  const [homePlayers, awayPlayers] = await Promise.all([resolveSide(homePlayerIds), resolveSide(awayPlayerIds)])

  return (
    <HeadToHeadView
      homePlayerIds={homePlayerIds}
      awayPlayerIds={awayPlayerIds}
      homePlayers={homePlayers}
      awayPlayers={awayPlayers}
    />
  )
}

/**
 * The players of one side, as the view needs them.
 *
 * `pageSize` is the roster's own length because `getPlayers` stays paginated
 * even when asked for specific ids, and a team can hold more players than its
 * default page. The rows come back ordered by name, so they are re-ordered
 * into ROSTER order here — index 0 is the main player / team captain, which is
 * how a side is read everywhere else in the app. Entities cannot cross into a
 * client component (only plain objects can) and the header only wants a name
 * and an avatar, so they are narrowed on the way. An id that resolves to
 * nobody (a deleted or deactivated account) simply drops out; the view names
 * that side by its ids instead.
 */
async function resolveSide(playerIds: number[]): Promise<HeadToHeadPlayer[]> {
  const { data: users } = await getPlayers({ ids: playerIds, pageSize: playerIds.length })

  return playerIds
    .map((id) => users.find((user) => user.id === id))
    .filter((user): user is User => user != null)
    .map((user) => ({
      id: user.id,
      displayName: getUserDisplayName(user),
      shortName: getUserShortName(user),
      email: user.email
    }))
}
