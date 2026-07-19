import { DB } from '@neogroup/neorm'
import { PaymentStatus } from '@/app/(protected)/(tournaments)/models/PaymentStatus'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentPayment } from '@/app/(protected)/(tournaments)/models/TournamentPayment'
import { createCompetitor, resolveRegistration } from '@/app/(protected)/(tournaments)/services/registrations'
import { ApiException } from '@/app/models/ApiException'
import { MercadoPagoAccount } from '@/app/models/MercadoPagoAccount'
import { Organization } from '@/app/models/Organization'
import { createPreference, getPaymentInfo, getValidAccessToken, refundPayment } from '@/app/services/mercadopago'

/** Splits an entry fee into the TeamUp service fee and the organizer's share. */
export function computeSplit(
  amount: number,
  feePercentage: number
): { serviceFeeAmount: number; organizerAmount: number } {
  const serviceFeeAmount = Math.round(amount * feePercentage) / 100
  const organizerAmount = Math.round((amount - serviceFeeAmount) * 100) / 100

  return { serviceFeeAmount, organizerAmount }
}

export interface CreateRegistrationPaymentInput {
  tournament: Tournament
  organization: Organization
  /** Player roster to register once the payment is approved (payer is playerIds[0]). */
  playerIds: number[]
  targetCategory: TournamentCategory
  /** Origin used to build the back/notification URLs (e.g. https://club.teamup.ar). */
  origin: string
  payerEmail?: string
}

/**
 * Creates a PENDING payment and the matching Mercado Pago Checkout Pro preference
 * (with the marketplace fee that goes to TeamUp). Returns the payment row with
 * its checkout URL (`initPoint`), where the player must be redirected.
 */
export async function createRegistrationPayment(input: CreateRegistrationPaymentInput): Promise<TournamentPayment> {
  const { tournament, organization, playerIds, targetCategory, origin } = input
  const amount = tournament.entryFee ?? 0

  if (!tournament.paid || amount <= 0) {
    throw new ApiException('El torneo no requiere pago de inscripción')
  }

  const account = await MercadoPagoAccount.where('userId', tournament.ownerId).first()

  if (!account) {
    throw new ApiException('El organizador aún no configuró los cobros para este torneo')
  }

  const feePercentage = organization.serviceFeePercentage ?? 0
  const { serviceFeeAmount, organizerAmount } = computeSplit(amount, feePercentage)
  const currency = tournament.currency || 'ARS'
  const now = new Date()
  const payment = new TournamentPayment()

  payment.organizationId = tournament.organizationId
  payment.tournamentId = tournament.id
  payment.tournamentCategoryId = targetCategory.id
  payment.playerIds = playerIds
  payment.status = PaymentStatus.PENDING
  payment.amount = amount
  payment.currency = currency
  payment.serviceFeePercentage = feePercentage
  payment.serviceFeeAmount = serviceFeeAmount
  payment.organizerAmount = organizerAmount
  payment.provider = 'mercadopago'
  payment.preferenceId = null
  payment.mpPaymentId = null
  payment.initPoint = null
  payment.competitorId = null
  payment.createdAt = now
  payment.updatedAt = now
  await payment.save()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin
  const accessToken = await getValidAccessToken(account)
  const preference = await createPreference(accessToken, {
    items: [
      {
        title: `Inscripción - ${tournament.name}`,
        quantity: 1,
        unit_price: amount,
        currency_id: currency
      }
    ],
    marketplaceFee: serviceFeeAmount,
    externalReference: String(payment.id),
    notificationUrl: `${appUrl}/api/processTournamentPaymentState?ref=${payment.id}`,
    backUrls: {
      success: `${origin}/tournaments/${tournament.id}?payment=success`,
      failure: `${origin}/tournaments/${tournament.id}?payment=failure`,
      pending: `${origin}/tournaments/${tournament.id}?payment=pending`
    },
    payerEmail: input.payerEmail
  })

  payment.preferenceId = preference.id
  payment.initPoint = account.liveMode === false ? preference.sandbox_init_point : preference.init_point
  payment.updatedAt = new Date()
  await payment.save()

  return payment
}

/**
 * Confirms (or rejects/refunds) a registration payment from a Mercado Pago
 * webhook notification. Idempotent: re-deliveries of an already-approved payment
 * are no-ops. When the payment is approved the competitor is created inside a
 * transaction; if the registration can no longer be honoured (tournament started
 * or full) the payment is refunded.
 */
export async function confirmPaymentFromWebhook(paymentRowId: number, mpPaymentId: string): Promise<void> {
  const payment = await TournamentPayment.find(paymentRowId)

  if (!payment) {
    return
  }

  if (payment.status === PaymentStatus.APPROVED || payment.status === PaymentStatus.REFUNDED) {
    return
  }

  const tournament = await Tournament.withoutGlobalScopes().find(payment.tournamentId)

  if (!tournament) {
    return
  }

  const account = await MercadoPagoAccount.where('userId', tournament.ownerId).first()

  if (!account) {
    // eslint-disable-next-line no-console
    console.error(`[payments] No Mercado Pago account for owner of tournament ${tournament.id}`)

    return
  }

  const accessToken = await getValidAccessToken(account)
  const mpPayment = await getPaymentInfo(accessToken, mpPaymentId)

  // Guard against spoofed notifications: the payment must reference this row.
  if (mpPayment.external_reference && mpPayment.external_reference !== String(payment.id)) {
    return
  }

  payment.mpPaymentId = String(mpPayment.id)

  if (mpPayment.status === 'rejected') {
    payment.status = PaymentStatus.REJECTED
    payment.updatedAt = new Date()
    await payment.save()

    return
  }

  if (mpPayment.status === 'cancelled') {
    payment.status = PaymentStatus.CANCELLED
    payment.updatedAt = new Date()
    await payment.save()

    return
  }

  if (mpPayment.status !== 'approved') {
    // pending / in_process / authorized — leave as PENDING and wait for another notification.
    payment.updatedAt = new Date()
    await payment.save()

    return
  }

  // Approved: register the competitor (re-validating the current state).
  const fullTournament = await Tournament.withoutGlobalScopes()
    .where('id', tournament.id)
    .with('categories', 'competitors')
    .first()

  if (!fullTournament) {
    return
  }

  try {
    // Re-validate the current tournament state (payer is playerIds[0]; the
    // optional partner, when the discipline registers as pairs, is playerIds[1]).
    const [payerId, partnerId = null] = payment.playerIds
    const resolved = await resolveRegistration(fullTournament, payerId, {
      tournamentCategoryId: payment.tournamentCategoryId,
      partnerUserId: partnerId
    })

    await DB.transaction(async () => {
      const competitor = await createCompetitor(resolved.targetCategory.id, resolved.playerIds)

      payment.competitorId = competitor.id
      payment.status = PaymentStatus.APPROVED
      payment.updatedAt = new Date()
      await payment.save()
    })
  } catch (error) {
    // Registration can no longer be honoured (tournament started/full/duplicate):
    // refund the payment so the player is not charged for a place they didn't get.
    // eslint-disable-next-line no-console
    console.error(`[payments] Could not honour approved payment ${payment.id}, refunding:`, error)

    try {
      await refundPayment(accessToken, String(mpPayment.id))
      payment.status = PaymentStatus.REFUNDED
    } catch (refundError) {
      // eslint-disable-next-line no-console
      console.error(`[payments] Refund failed for payment ${payment.id}:`, refundError)
    }

    payment.updatedAt = new Date()
    await payment.save()
  }
}
