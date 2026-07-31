import { createServicePayment } from '@/app/(protected)/(payments)/services/payments'
import { ApiException } from '@/app/models/ApiException'
import { withOrganizerOrAdmin } from '@/app/utils/api-server'

export interface CreateServicePaymentResult {
  /** Mercado Pago checkout URL the payer must be redirected to. */
  initPoint: string
  /** Id of the created settlement row. */
  paymentId: number
}

/**
 * POST /api/createServicePayment — opens a Mercado Pago checkout for every
 * pending tournament of the organization. The tournaments are only marked as
 * paid when the webhook confirms the payment.
 */
export const POST = withOrganizerOrAdmin(
  async (request, context, userId, organizationId): Promise<CreateServicePaymentResult> => {
    const origin = new URL(request.url).origin
    const payment = await createServicePayment({ organizationId, userId, origin })

    if (!payment.initPoint) {
      throw new ApiException('No se pudo iniciar el pago')
    }

    return { initPoint: payment.initPoint, paymentId: payment.id }
  }
)
