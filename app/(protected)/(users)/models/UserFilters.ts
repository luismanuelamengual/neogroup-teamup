import { Role } from '@/app/models/Role'

/** Filters accepted by the administrator's users browser. */
export interface UserFilters {
  /** Free text matched against first name, last name and email. */
  query?: string
  /** Restrict the listing to a single role. `null` / omitted returns every role. */
  roleId?: Role | null
  page?: number
  pageSize?: number
}
