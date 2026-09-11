import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'

/** Filters accepted by the categories listing. */
export interface CategoryFilters {
  /** Free text matched against the category name. */
  query?: string
  /** Restrict the listing to a single discipline. `null` / omitted returns every one. */
  discipline?: Discipline | null
  /** Restrict the result to these ids — a lookup rather than a search, analogous to `getTournaments`. */
  ids?: number[]
  page?: number
  pageSize?: number
}
