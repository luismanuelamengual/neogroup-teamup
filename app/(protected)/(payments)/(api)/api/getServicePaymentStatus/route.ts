import { PaymentStatus } from '@/app/(protected)/(payments)/models/PaymentStatus'
import { getServicePaymentStatus } from '@/app/(protected)/(payments)/services/payments'
import { withOrganizerOrAdmin } from '@/app/utils/api-server'

export interface ServicePaymentStatusResult {
  /** Status of the settlement, or null when it does not belong to this organization. */
  status: PaymentStatus | null
}

/**
 * POST /api/getServicePaymentStatus — status of a settlement, used to poll after
 * returning from the Mercado Pago checkout until the webhook confirms it.
 */
export const POST = withOrganizerOrAdmin(async (request): Promise<ServicePaymentStatusResult> => {
  const { paymentId } = (await request.json()) as { paymentId: number }

  return { status: await getServicePaymentStatus(Number(paymentId)) }
})
