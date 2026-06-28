import { JoinTournamentInput } from '@/app/(protected)/(tournaments)/models/JoinTournamentInput'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { createRegistrationPayment } from '@/app/(protected)/(tournaments)/services/payments'
import { createCompetitor, resolveRegistration } from '@/app/(protected)/(tournaments)/services/registrations'
import { ApiException } from '@/app/models/ApiException'
import { getOrganization } from '@/app/services/organizations'
import { withAuth } from '@/app/utils/api-server'

export interface JoinTournamentResult {
  /** True when the tournament requires payment and a checkout was created. */
  paid: boolean
  /** Mercado Pago checkout URL the player must be redirected to (paid only). */
  initPoint?: string
  /** Id of the created payment row (paid only). */
  paymentId?: number
}

/**
 * POST /api/joinTournament — registers the signed-in user into a tournament.
 *
 * Free tournaments register the competitor immediately. Paid tournaments create
 * a Mercado Pago checkout and return its `initPoint`; the competitor is only
 * created once the payment is confirmed by the webhook.
 */
export const POST = withAuth(async (request, context, userId, organizationId): Promise<JoinTournamentResult> => {
  const { tournamentId, ...input } = (await request.json()) as JoinTournamentInput & { tournamentId: number }
  const tournament = await Tournament.where('id', Number(tournamentId)).with('categories', 'competitors').first()

  if (!tournament) {
    throw new ApiException('Torneo no encontrado')
  }

  const { targetCategory, partnerUserId } = await resolveRegistration(tournament, userId, input)

  // Free tournament: register immediately.
  if (!tournament.paid || !tournament.entryFee || tournament.entryFee <= 0) {
    await createCompetitor(targetCategory.id, userId, partnerUserId)

    return { paid: false }
  }

  // Paid tournament: create the checkout and defer registration to the webhook.
  const organization = await getOrganization({ id: organizationId })

  if (!organization) {
    throw new ApiException('organizationNotFound', 404)
  }

  const origin = new URL(request.url).origin
  const payment = await createRegistrationPayment({
    tournament,
    organization,
    userId,
    partnerUserId,
    targetCategory,
    origin
  })

  if (!payment.initPoint) {
    throw new ApiException('No se pudo iniciar el pago de la inscripción')
  }

  return { paid: true, initPoint: payment.initPoint, paymentId: payment.id }
})
