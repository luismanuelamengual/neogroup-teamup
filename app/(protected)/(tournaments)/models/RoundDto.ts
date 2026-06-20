import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'
import { RoundType } from '@/app/(protected)/(tournaments)/models/RoundType'

/** Serializable representation of a Round — safe to pass server→client. */
export interface RoundDto {
  id: number
  tournamentId: number
  number: number
  status: RoundStatus
  categoryId: number | null
  type: RoundType
  groupNumber: number | null
  active: boolean
  createdAt: string
}
