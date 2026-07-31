import { PendingPaymentsDto } from '@/app/(protected)/(payments)/models/PendingPaymentsDto'
import { getPendingPayments } from '@/app/(protected)/(payments)/services/payments'
import { withOrganizerOrAdmin } from '@/app/utils/api-server'

/**
 * POST /api/getPendingPayments — tournaments of the organization whose service
 * fee is still unsettled, with the amount each one owes and the total.
 *
 * Organization-wide for both profiles: an organizer and the administrator see
 * (and can pay) the same debt.
 */
export const POST = withOrganizerOrAdmin(
  async (request, context, userId, organizationId): Promise<PendingPaymentsDto> => getPendingPayments(organizationId)
)
