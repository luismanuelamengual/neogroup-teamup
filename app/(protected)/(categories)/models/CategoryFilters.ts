import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'

/** Filters accepted by the administrator's categories browser. */
export interface CategoryFilters {
  /** Free text matched against the category name. */
  query?: string
  /** Restrict the listing to a single discipline. `null` / omitted returns every one. */
  discipline?: Discipline | null
  page?: number
  pageSize?: number
}
