'use client'

import { useCallback } from 'react'
import type { CreateServicePaymentResult } from '@/app/(protected)/(payments)/(api)/api/createServicePayment/route'
import type { ServicePaymentStatusResult } from '@/app/(protected)/(payments)/(api)/api/getServicePaymentStatus/route'
import { PendingPaymentsDto } from '@/app/(protected)/(payments)/models/PendingPaymentsDto'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useRequests } from '@/app/hooks/useRequests'

/** Client API of the payments module (organizer / administrator only). */
export function usePayments() {
  const executeRequest = useRequests()
  const { showSuccessMessage } = useNotifications()
  const getPendingPayments = useCallback(
    (): Promise<PendingPaymentsDto | null> =>
      executeRequest<PendingPaymentsDto>('/getPendingPayments', {}, false).catch(() => null),
    [executeRequest]
  )
  /** Opens the Mercado Pago checkout for every pending tournament. */
  const payPendingTournaments = useCallback(async (): Promise<CreateServicePaymentResult> => {
    const result = await executeRequest<CreateServicePaymentResult>('/createServicePayment')

    showSuccessMessage('Redirigiendo a Mercado Pago para completar el pago...')
    window.location.href = result.initPoint

    return result
  }, [executeRequest, showSuccessMessage])
  const getServicePaymentStatus = useCallback(
    (paymentId: number): Promise<ServicePaymentStatusResult | null> =>
      executeRequest<ServicePaymentStatusResult>('/getServicePaymentStatus', { paymentId }, false).catch(() => null),
    [executeRequest]
  )

  return { getPendingPayments, payPendingTournaments, getServicePaymentStatus }
}
