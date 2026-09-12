import dayjs from 'dayjs'
import { Discipline } from '@/app/(protected)/(disciplines)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(disciplines)/models/SubDiscipline'
import { isDoublesDiscipline } from '@/app/(protected)/(disciplines)/utils/disciplines'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/**
 * Whether a tournament's registration window has opened, from the browser's
 * local date (no organization-timezone precision — that's the server's job,
 * see the same-named check in
 * app/(protected)/(tournaments)/services/registrations.ts, backed by
 * `isRegistrationOpen` in app/(protected)/(tournaments)/utils/tournaments.ts).
 * Used to drive client-only UI: hiding "Inscribirme" and swapping the STAND_BY
 * status chip between "Nuevo" and "Inscripción abierta".
 *
 * Null/undefined `startInscriptionsDate` means registrations are open since
 * the tournament was created.
 */
export function isRegistrationOpen(startInscriptionsDate: string | null | undefined): boolean {
  return !startInscriptionsDate || startInscriptionsDate <= dayjs().format('YYYY-MM-DD')
}

/**
 * True when a competitor is a team of a venue with N players, instead of a
 * single player or a pair. Only interclubes registers this way, and it does so
 * regardless of the discipline: the team plays both singles and doubles inside
 * every series.
 */
export function registersAsTeam(type: TournamentType): boolean {
  return type === TournamentType.INTERCLUBS
}

/**
 * True when competitors register as pairs (player + partner).
 * Interclubes registers whole teams instead (see `registersAsTeam`).
 */
export function registersAsPairs(
  discipline: Discipline,
  subDiscipline: SubDiscipline | null,
  type: TournamentType
): boolean {
  if (registersAsTeam(type)) {
    return false
  }

  return isDoublesDiscipline(discipline, subDiscipline)
}
