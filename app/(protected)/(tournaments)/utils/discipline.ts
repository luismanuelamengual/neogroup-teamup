import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/** True when the discipline is played in pairs (padel, or tennis doubles). */
export function isDoublesDiscipline(discipline: Discipline, subDiscipline: SubDiscipline | null): boolean {
  return (
    discipline === Discipline.PADEL || (discipline === Discipline.TENNIS && subDiscipline === SubDiscipline.DOUBLES)
  )
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
 * Americano with partner swapping (AMERICANO_WITH_SWAP) registers players individually,
 * and interclubes registers whole teams (see `registersAsTeam`).
 */
export function registersAsPairs(
  discipline: Discipline,
  subDiscipline: SubDiscipline | null,
  type: TournamentType
): boolean {
  if (registersAsTeam(type)) {
    return false
  }

  if (!isDoublesDiscipline(discipline, subDiscipline)) {
    return false
  }

  if (type === TournamentType.AMERICANO_WITH_SWAP) {
    return false
  }

  return true
}
