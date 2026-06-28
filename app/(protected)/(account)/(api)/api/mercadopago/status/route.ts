import { MercadoPagoAccount } from '@/app/models/MercadoPagoAccount'
import { isMercadoPagoConfigured } from '@/app/services/mercadopago'
import { withAuth } from '@/app/utils/api-server'

export interface MercadoPagoStatus {
  /** Whether the platform has Mercado Pago credentials configured. */
  configured: boolean
  /** Whether this user has a connected Mercado Pago account. */
  connected: boolean
  mpUserId: string | null
  liveMode: boolean | null
}

/** POST /api/mercadopago/status — connection status of the signed-in organizer's MP account. */
export const POST = withAuth(async (request, context, userId): Promise<MercadoPagoStatus> => {
  const account = await MercadoPagoAccount.where('userId', userId).first()

  return {
    configured: isMercadoPagoConfigured(),
    connected: Boolean(account),
    mpUserId: account?.mpUserId ?? null,
    liveMode: account?.liveMode ?? null
  }
})
