import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/** True when the discipline is played in pairs (padel, or tennis doubles). */
export function isDoublesDiscipline(discipline: Discipline, subDiscipline: SubDiscipline | null): boolean {
  return (
    discipline === Discipline.PADEL || (discipline === Discipline.TENNIS && subDiscipline === SubDiscipline.DOUBLES)
  )
}

/**
 * True when competitors register as pairs (player + partner).
 * Americano with partner swapping (AMERICANO_WITH_SWAP) registers players individually.
 */
export function registersAsPairs(
  discipline: Discipline,
  subDiscipline: SubDiscipline | null,
  type: TournamentType,
  settings: TournamentSettings
): boolean {
  if (!isDoublesDiscipline(discipline, subDiscipline)) {
    return false
  }

  if (type === TournamentType.AMERICANO_WITH_SWAP) {
    return false
  }

  return true
}
