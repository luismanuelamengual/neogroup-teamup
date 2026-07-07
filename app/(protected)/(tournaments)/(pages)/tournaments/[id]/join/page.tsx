import { redirect } from 'next/navigation'

/**
 * Invite-link landing route, e.g. "https://club-aleman.teamup.ar/tournaments/36/join"
 * (this is the URL shared from ManageTournamentView's "Compartir" dialog).
 *
 * This route itself does nothing but redirect to the tournament page with
 * `?join=1`, which tells PlayerTournamentView to auto-open the join dialog.
 * The interesting part happens before we even get here: this path is
 * protected (see auth.config.ts), so an unauthenticated visitor is
 * intercepted by the proxy middleware and sent to
 * "/login?callbackUrl=<this URL>". Once they sign in, app/page.tsx picks up
 * that callbackUrl and redirects back here automatically — so the user lands
 * straight on the join flow instead of some generic home screen.
 */
export default async function JoinTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  redirect(`/tournaments/${id}?join=1`)
}
