import { PaymentStatus } from '@/app/(protected)/(tournaments)/models/PaymentStatus'

/** Serializable representation of a TournamentPayment — safe to pass server→client. */
export interface TournamentPaymentDto {
  id: number
  tournamentId: number
  tournamentCategoryId: number
  userId: number
  partnerUserId: number | null
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
