/** Generic paginated response returned by list endpoints. */
export interface PaginatedResponse<T> {
  data: T
  total: number
  lastPage: number
  currrentPage: number
  perPage: number
  from: number
  to: number
}
