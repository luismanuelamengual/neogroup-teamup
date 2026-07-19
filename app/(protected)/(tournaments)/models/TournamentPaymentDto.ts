import { PaymentStatus } from '@/app/(protected)/(tournaments)/models/PaymentStatus'

/** Serializable representation of a TournamentPayment — safe to pass server→client. */
export interface TournamentPaymentDto {
  id: number
  tournamentId: number
  tournamentCategoryId: number
  /** Roster of players this payment registers (payer is playerIds[0]). */
  playerIds: number[]
  status: PaymentStatus
  amount: number
  currency: string
  serviceFeePercentage: number
  serviceFeeAmount: number
  organizerAmount: number
  preferenceId: string | null
  mpPaymentId: string | null
  initPoint: string | null
  competitorId: number | null
  createdAt: string
  updatedAt: string
}
