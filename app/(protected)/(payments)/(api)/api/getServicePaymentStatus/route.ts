import { PaymentStatus } from '@/app/(protected)/(payments)/models/PaymentStatus'
import { ServicePayment } from '@/app/(protected)/(payments)/models/ServicePayment'
import { withOrganizerOrAdmin } from '@/app/utils/api-server'

export interface ServicePaymentStatusResult {
  /** Status of the settlement, or null when it does not belong to this organization. */
  status: PaymentStatus | null
}

/**
 * POST /api/getServicePaymentStatus — status of a settlement, used to poll after
 * returning from the Mercado Pago checkout until the webhook confirms it.
 */
export const POST = withOrganizerOrAdmin(
  async (request, context, userId, organizationId): Promise<ServicePaymentStatusResult> => {
    const { paymentId } = (await request.json()) as { paymentId: number }
    const payment = await ServicePayment.where('id', Number(paymentId)).where('organizationId', organizationId).first()

    return { status: payment?.status ?? null }
  }
)
