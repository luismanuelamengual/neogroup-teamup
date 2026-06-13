import { Tournament } from '@/app/(tournaments)/models/Tournament'

/** Returns a plain tournament object with relations stripped and startDate normalized. */
export function toTournamentDto(tournament: Tournament, competitorsCount?: number): Tournament {
  // The database driver may return DATE columns as Date objects.
  const startDate: unknown = tournament.startDate
  // Strip eagerly-loaded relations; they are not needed in client-side tournament objects.
  const { owner: _owner, competitors: _competitors, rounds: _rounds, matches: _matches, ...fields } = tournament as any

  return {
    ...fields,
    startDate: startDate instanceof Date ? startDate.toISOString().slice(0, 10) : String(startDate).slice(0, 10),
    settings: tournament.settings ?? {},
    competitorsCount
  } as Tournament
}
