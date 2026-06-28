import { MercadoPagoAccount } from '@/app/models/MercadoPagoAccount'
import { withAuth } from '@/app/utils/api-server'

/** POST /api/mercadopago/disconnect — removes the organizer's connected Mercado Pago account. */
export const POST = withAuth(async (request, context, userId) => {
  const account = await MercadoPagoAccount.where('userId', userId).first()

  if (account) {
    await account.delete()
  }
})
