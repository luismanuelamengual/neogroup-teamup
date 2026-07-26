/** Serializable representation of a Site — safe to pass server→client. */
export interface SiteDto {
  id: number
  organizationId: number
  name: string
}
