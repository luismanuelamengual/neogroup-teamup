import { Discipline } from '@/app/(protected)/(disciplines)/models/Discipline'

/** Serializable representation of a Category — safe to pass server→client. */
export interface CategoryDto {
  id: number
  organizationId: number
  name: string
  discipline: Discipline
}
