'use client'

import { useCallback } from 'react'
import type { MercadoPagoStatus } from '@/app/(protected)/(account)/(api)/api/mercadopago/status/route'
import { useNotifications } from '@/app/hooks/useNotifications'
import { useRequests } from '@/app/hooks/useRequests'

export function useMercadoPago() {
  const executeRequest = useRequests()
  const { showSuccessMessage } = useNotifications()
  const getStatus = useCallback(
    (): Promise<MercadoPagoStatus> => executeRequest<MercadoPagoStatus>('/mercadopago/status'),
    [executeRequest]
  )
  /** Starts the OAuth flow by navigating the browser to the connect endpoint. */
  const connect = useCallback(() => {
    window.location.href = '/api/mercadopago/connect'
  }, [])
  const disconnect = useCallback(async (): Promise<void> => {
    await executeRequest('/mercadopago/disconnect')
    showSuccessMessage('Cuenta de Mercado Pago desvinculada')
  }, [executeRequest, showSuccessMessage])

  return { getStatus, connect, disconnect }
}
