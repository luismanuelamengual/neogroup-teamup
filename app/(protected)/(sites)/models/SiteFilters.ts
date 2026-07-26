/** Filters accepted by the sites listing. */
export interface SiteFilters {
  /** Free text matched against the site name. */
  query?: string
  page?: number
  pageSize?: number
}
