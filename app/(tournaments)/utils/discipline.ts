import { Discipline } from '@/app/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(tournaments)/models/SubDiscipline'
import { TournamentSettings } from '@/app/(tournaments)/models/TournamentSettings'
import { TournamentType } from '@/app/(tournaments)/models/TournamentType'

/** True when the discipline is played in pairs (padel, or tennis doubles). */
export function isDoublesDiscipline(discipline: Discipline, subDiscipline: SubDiscipline | null): boolean {
  return (
    discipline === Discipline.PADEL || (discipline === Discipline.TENNIS && subDiscipline === SubDiscipline.DOUBLES)
  )
}

/**
 * True when competitors register as pairs (player + partner).
 * Americano tournaments with partner swapping register players individually.
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

  if (type === TournamentType.AMERICANO && settings.swapPartnersEachRound) {
    return false
  }

  return true
}
