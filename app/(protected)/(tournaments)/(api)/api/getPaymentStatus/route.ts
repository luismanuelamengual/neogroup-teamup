import { PaymentStatus } from '@/app/(protected)/(tournaments)/models/PaymentStatus'
import { TournamentPayment } from '@/app/(protected)/(tournaments)/models/TournamentPayment'
import { withAuth } from '@/app/utils/api-server'

export interface PaymentStatusResult {
  /** Latest payment status for the signed-in user in this tournament, or null when none. */
  status: PaymentStatus | null
  competitorId: number | null
}

/**
 * POST /api/getPaymentStatus — latest registration payment status of the
 * signed-in user for a tournament (used to poll after returning from checkout).
 */
export const POST = withAuth(async (request, context, userId): Promise<PaymentStatusResult> => {
  const { tournamentId } = (await request.json()) as { tournamentId: number }
  const payment = await TournamentPayment.where('tournamentId', Number(tournamentId))
    .where('userId', userId)
    .orderByDesc('id')
    .first()

  return {
    status: payment?.status ?? null,
    competitorId: payment?.competitorId ?? null
  }
})
