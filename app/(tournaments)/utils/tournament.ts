import { Tournament, TournamentDto } from '@/app/(tournaments)/models/Tournament'

/** Builds the serializable DTO of a tournament (relations are not included). */
export function toTournamentDto(tournament: Tournament, competitorsCount?: number): TournamentDto {
  // The database driver may return DATE columns as Date objects.
  const startDate: unknown = tournament.startDate
  const { owner: _owner, competitors: _competitors, rounds: _rounds, matches: _matches, ...dto } = tournament.toDto()

  return {
    ...dto,
    startDate: startDate instanceof Date ? startDate.toISOString().slice(0, 10) : String(startDate).slice(0, 10),
    settings: tournament.settings ?? {},
    competitorsCount
  }
}
