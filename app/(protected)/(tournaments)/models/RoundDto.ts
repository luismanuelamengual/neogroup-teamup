import { RoundStatus } from '@/app/(protected)/(tournaments)/models/RoundStatus'

/** Serializable representation of a Round — safe to pass server→client. */
export interface RoundDto {
  id: number
  tournamentId: number
  number: number
  status: RoundStatus
  category: string | null
  createdAt: string
}
