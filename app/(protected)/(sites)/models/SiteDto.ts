import { SiteData } from '@/app/(protected)/(sites)/models/SiteData'

/** Serializable representation of a Site — safe to pass server→client. */
export interface SiteDto {
  id: number
  organizationId: number
  name: string
  /** Courts setup and planning defaults of the venue. Null until it is planned. */
  data: SiteData | null
}
