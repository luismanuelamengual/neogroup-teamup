import { redirect } from 'next/navigation'
import { auth } from '@/auth'

/**
 * Entry point: routes the user to the right home depending on the session,
 * the selected profile and an optional callbackUrl (e.g. invite links).
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (!session.user.profile) {
    redirect(`/select-profile${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`)
  }

  if (callbackUrl && callbackUrl.startsWith('/')) {
    redirect(callbackUrl)
  }

  redirect(session.user.profile === 'organizer' ? '/organizer/tournaments' : '/player/tournaments')
}
