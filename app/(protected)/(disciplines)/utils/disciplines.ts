import { Discipline } from '@/app/(protected)/(disciplines)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(disciplines)/models/SubDiscipline'

/** True when the discipline is played in pairs (padel, or tennis doubles). */
export function isDoublesDiscipline(discipline: Discipline, subDiscipline: SubDiscipline | null): boolean {
  return (
    discipline === Discipline.PADEL || (discipline === Discipline.TENNIS && subDiscipline === SubDiscipline.DOUBLES)
  )
}
