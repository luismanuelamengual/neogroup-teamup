import { RoundSettings } from '@/app/(protected)/(tournaments)/models/Round'
import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'

/** Serializable representation of a Round — safe to pass server→client. */
export interface RoundDto {
  id: number
  tournamentCategoryId: number
  number: number
  status: RoundStatus
  type: RoundType
  settings: RoundSettings | null
  active: boolean
  createdAt: string
}
