import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'

/**
 * Payload used by the administrator to create or edit a category of its
 * organization. `subDiscipline` only applies to tennis (padel is always played
 * in doubles); it is forced to null for every other discipline.
 */
export interface CategoryInput {
  name: string
  discipline: Discipline
  subDiscipline?: SubDiscipline | null
}
