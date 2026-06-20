import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'

/** Serializable representation of a Category — safe to pass server→client. */
export interface CategoryDto {
  id: number
  organizationId: number
  name: string
  discipline: Discipline
  subDiscipline: SubDiscipline | null
}
