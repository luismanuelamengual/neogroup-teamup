import { DB } from '@neogroup/neorm'
import dayjs from 'dayjs'
import { PaymentStatus } from '@/app/(protected)/(payments)/models/PaymentStatus'
import { PendingPaymentsDto, PendingTournamentDto } from '@/app/(protected)/(payments)/models/PendingPaymentsDto'
import { ServicePayment } from '@/app/(protected)/(payments)/models/ServicePayment'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Match } from '@/app/(protected)/(tournaments)/models/Match'
import { MatchStatus } from '@/app/(protected)/(tournaments)/models/MatchStatus'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentStatus } from '@/app/(protected)/(tournaments)/models/TournamentStatus'
import { ApiException } from '@/app/models/ApiException'
import { Organization } from '@/app/models/Organization'
import { createPreference, getPaymentInfo, isSandbox } from '@/app/services/mercadopago'

/**
 * Settlement of TeamUp's service fee.
 *
 * Players do not pay through the platform: they settle the entry fee with the
 * organizer off-platform. What TeamUp bills is a percentage
 * (`organizations.serviceFeePercentage`) of what each tournament collected,
 * for the tournaments that have already started. How many competitors count
 * depends on whether the tournament is done:
 *
 *  - **Ongoing**: every registered competitor × the entry fee. The roster can
 *    still grow — an organizer may register a late entrant into a structural
 *    hole while the tournament is running (see
 *    `services/administration.ts#registerCompetitor`) — so the bill tracks
 *    the full roster while that is still possible.
 *  - **Finished**: only the competitors that took the court at least once
 *    (appear in a `PLAYED` match) × the entry fee. Nothing can grow the
 *    roster anymore, and a competitor who registered but never showed up
 *    never generated anything for the organizer to collect off-platform, so
 *    they are not billed either.
 *
 * **Why this stays a one-time, final bill.** Once a tournament is flagged
 * `paid` it drops out of `getPendingPayments` for good — it is never billed
 * again — so whatever gets settled has to be it. That is why paying an
 * ongoing tournament also closes its registrations for good
 * (`registerCompetitor` in `services/administration.ts` refuses a new entrant
 * once `paid` is true): without that, an organizer could keep adding paying
 * players to a tournament TeamUp had already been paid for. A finished
 * tournament has no such loophole — its structure cannot change at all — so
 * only the ongoing case needs the extra guard.
 *
 * Everything is in ARS: the platform only creates ARS tournaments and the
 * checkout is a single ARS payment, so the currency is carried around for
 * display rather than as a real dimension.
 */

/** A tournament is overdue once it started more than this long ago. */
const OVERDUE_MONTHS = 1

/** Applies a percentage fee to an amount, rounded to two decimals. */
export function computeServiceFee(grossAmount: number, feePercentage: number): number {
  return Math.round(grossAmount * feePercentage) / 100
}

/** "YYYY-MM-DD" before which an unsettled tournament counts as overdue. */
function getOverdueCutoff(): string {
  return dayjs().subtract(OVERDUE_MONTHS, 'month').format('YYYY-MM-DD')
}

/**
 * Registered competitors per tournament, across every category instance. Used
 * to bill an ongoing tournament, whose roster can still change.
 *
 * A competitor is one *inscription*, not one player: a doubles pair (or a whole
 * interclubes team) counts once, because it pays a single entry fee.
 */
async function countRegisteredCompetitors(tournamentIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>()

  if (tournamentIds.length === 0) {
    return counts
  }

  const categories = await TournamentCategory.whereIn('tournamentId', tournamentIds).get()

  if (categories.length === 0) {
    return counts
  }

  const tournamentByCategory = new Map(categories.map((category) => [category.id, category.tournamentId]))
  const competitors = await Competitor.whereIn(
    'tournamentCategoryId',
    categories.map((category) => category.id)
  ).get()

  for (const competitor of competitors) {
    const tournamentId = tournamentByCategory.get(competitor.tournamentCategoryId)

    if (tournamentId === undefined) {
      continue
    }

    counts.set(tournamentId, (counts.get(tournamentId) ?? 0) + 1)
  }

  return counts
}

/**
 * Competitors that took the court at least once per tournament (appear as the
 * home or away side of a match with a real result), across every category
 * instance. Used to bill a finished tournament, whose roster is closed for
 * good — so this is the final count, unlike `countRegisteredCompetitors`.
 *
 * A `PENDING` match (never played) or a `WALKOVER`/`VOID` one (a bye, a
 * forfeit, or a slot the structure confirmed will never be filled) does not
 * count as having played: nobody actually took the court, so the organizer
 * never collected anything from that inscription to pass on to TeamUp.
 */
async function countPlayedCompetitors(tournamentIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>()

  if (tournamentIds.length === 0) {
    return counts
  }

  const categories = await TournamentCategory.whereIn('tournamentId', tournamentIds).get()

  if (categories.length === 0) {
    return counts
  }

  const tournamentByCategory = new Map(categories.map((category) => [category.id, category.tournamentId]))
  const matches = await Match.whereIn(
    'tournamentCategoryId',
    categories.map((category) => category.id)
  )
    .where('status', MatchStatus.PLAYED)
    .get()
  const playedCompetitorIds = new Map<number, Set<number>>()

  for (const match of matches) {
    const tournamentId = tournamentByCategory.get(match.tournamentCategoryId)

    if (tournamentId === undefined) {
      continue
    }

    const competitorIds = playedCompetitorIds.get(tournamentId) ?? new Set<number>()

    if (match.homeCompetitorId != null) {
      competitorIds.add(match.homeCompetitorId)
    }

    if (match.awayCompetitorId != null) {
      competitorIds.add(match.awayCompetitorId)
    }

    playedCompetitorIds.set(tournamentId, competitorIds)
  }

  for (const [tournamentId, competitorIds] of playedCompetitorIds) {
    counts.set(tournamentId, competitorIds.size)
  }

  return counts
}

/**
 * Everything the organization owes TeamUp: its tournaments with an entry fee
 * that already started and are not settled yet, with the amount each one owes
 * and the total.
 */
export async function getPendingPayments(organizationId: number): Promise<PendingPaymentsDto> {
  // Read the model directly rather than through the cached `getOrganization`
  // helper: that one wraps its reads in Next.js' `unstable_cache`, which needs a
  // real request/build context and throws outside of one — and this service also
  // runs from the webhook and from the test suite. Same trade-off as
  // `getEnabledDisciplines`.
  const organization = await Organization.where('id', organizationId).first()

  if (!organization) {
    throw new ApiException('Organización no encontrada', 404)
  }

  const serviceFeePercentage = organization.serviceFeePercentage ?? 0
  const candidates = await Tournament.withoutGlobalScopes()
    .where('organizationId', organizationId)
    .where('paid', false)
    .whereNotNull('entryFee')
    .where('entryFee', '>', 0)
    // Only tournaments that already started: while one is in STAND_BY its roster
    // (and therefore its bill) can still grow, so there is nothing final to charge.
    .whereIn('status', [TournamentStatus.ONGOING, TournamentStatus.FINISHED])
    .orderBy('startDate')
    .get()
  const ongoingIds = candidates
    .filter((tournament) => tournament.status === TournamentStatus.ONGOING)
    .map((tournament) => tournament.id)
  const finishedIds = candidates
    .filter((tournament) => tournament.status === TournamentStatus.FINISHED)
    .map((tournament) => tournament.id)
  const [registeredCounts, playedCounts] = await Promise.all([
    countRegisteredCompetitors(ongoingIds),
    countPlayedCompetitors(finishedIds)
  ])
  const cutoff = getOverdueCutoff()
  const tournaments: PendingTournamentDto[] = []

  for (const tournament of candidates) {
    // Ongoing: bill the full (still growable) roster. Finished: only whoever
    // actually took the court — see the module docblock.
    const competitorsCount =
      tournament.status === TournamentStatus.FINISHED
        ? (playedCounts.get(tournament.id) ?? 0)
        : (registeredCounts.get(tournament.id) ?? 0)

    // A tournament that started with nobody registered owes nothing (and must
    // not block the creation of new tournaments either).
    if (competitorsCount === 0) {
      continue
    }

    const entryFee = tournament.entryFee ?? 0
    const grossAmount = Math.round(competitorsCount * entryFee * 100) / 100

    tournaments.push({
      id: tournament.id,
      name: tournament.name,
      startDate: tournament.startDate,
      entryFee,
      competitorsCount,
      grossAmount,
      amount: computeServiceFee(grossAmount, serviceFeePercentage),
      overdue: tournament.startDate < cutoff
    })
  }

  return {
    tournaments,
    serviceFeePercentage,
    currency: 'ARS',
    competitorsCount: tournaments.reduce((total, item) => total + item.competitorsCount, 0),
    grossAmount: Math.round(tournaments.reduce((total, item) => total + item.grossAmount, 0) * 100) / 100,
    // The total is the sum of the per-tournament amounts (rather than the fee of
    // the total), so every line of the detail adds up to what is charged.
    amount: Math.round(tournaments.reduce((total, item) => total + item.amount, 0) * 100) / 100,
    overdueCount: tournaments.filter((item) => item.overdue).length
  }
}

/**
 * Whether the organization has unsettled tournaments that started more than a
 * month ago. Used to block the creation of new tournaments and to raise the
 * reminder banner on the home dashboards.
 */
export async function hasOverdueDebt(organizationId: number): Promise<boolean> {
  const { overdueCount } = await getPendingPayments(organizationId)

  return overdueCount > 0
}

export interface CreateServicePaymentInput {
  organizationId: number
  /** User starting the checkout (organizer or administrator). */
  userId: number
  /** Origin used to build the back URLs (e.g. https://club.teamup.ar). */
  origin: string
  payerEmail?: string
}

/**
 * Creates a PENDING settlement covering **every** pending tournament of the
 * organization and its Mercado Pago Checkout Pro preference, collected by the
 * TeamUp account. Returns the row with its checkout URL (`initPoint`), where
 * the payer must be redirected.
 *
 * The row snapshots the tournaments and amounts as they are right now, so a
 * match played (or a registration added) while the payer is on the Mercado Pago
 * checkout cannot change what is being charged; whatever happens afterwards is
 * simply billed in the next settlement.
 */
export async function createServicePayment(input: CreateServicePaymentInput): Promise<ServicePayment> {
  const { organizationId, userId, origin } = input
  const pending = await getPendingPayments(organizationId)

  if (pending.tournaments.length === 0 || pending.amount <= 0) {
    throw new ApiException('No hay torneos pendientes de pago')
  }

  const now = new Date()
  const payment = new ServicePayment()

  payment.organizationId = organizationId
  payment.userId = userId
  payment.tournamentIds = pending.tournaments.map((tournament) => tournament.id)
  payment.competitorsCount = pending.competitorsCount
  payment.grossAmount = pending.grossAmount
  payment.serviceFeePercentage = pending.serviceFeePercentage
  payment.amount = pending.amount
  payment.currency = pending.currency
  payment.status = PaymentStatus.PENDING
  payment.provider = 'mercadopago'
  payment.preferenceId = null
  payment.mpPaymentId = null
  payment.initPoint = null
  payment.createdAt = now
  payment.updatedAt = now
  await payment.save()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin
  const count = pending.tournaments.length
  const preference = await createPreference({
    items: [
      {
        title: `Servicio TeamUp — ${count} ${count === 1 ? 'torneo' : 'torneos'}`,
        quantity: 1,
        unit_price: pending.amount,
        currency_id: pending.currency
      }
    ],
    externalReference: String(payment.id),
    notificationUrl: `${appUrl}/api/processServicePaymentState?ref=${payment.id}`,
    // The settlement id travels back in the URL so the page returning from the
    // checkout knows which payment to poll for confirmation.
    backUrls: {
      success: `${origin}/payments?payment=success&ref=${payment.id}`,
      failure: `${origin}/payments?payment=failure&ref=${payment.id}`,
      pending: `${origin}/payments?payment=pending&ref=${payment.id}`
    },
    payerEmail: input.payerEmail
  })

  payment.preferenceId = preference.id
  payment.initPoint = isSandbox() ? preference.sandbox_init_point : preference.init_point
  payment.updatedAt = new Date()
  await payment.save()

  return payment
}

/**
 * Confirms (or rejects) a settlement from a Mercado Pago webhook notification.
 *
 * Idempotent: re-deliveries of an already-approved settlement are no-ops. When
 * approved, every tournament the settlement covers is marked as paid inside a
 * transaction, so the settlement and the tournaments it clears can never
 * disagree.
 */
export async function confirmServicePaymentFromWebhook(paymentRowId: number, mpPaymentId: string): Promise<void> {
  const payment = await ServicePayment.find(paymentRowId)

  if (!payment || payment.status === PaymentStatus.APPROVED) {
    return
  }

  const mpPayment = await getPaymentInfo(mpPaymentId)

  // Guard against spoofed notifications: the payment must reference this row.
  if (mpPayment.external_reference && mpPayment.external_reference !== String(payment.id)) {
    return
  }

  payment.mpPaymentId = String(mpPayment.id)
  payment.updatedAt = new Date()

  if (mpPayment.status === 'rejected') {
    payment.status = PaymentStatus.REJECTED
    await payment.save()

    return
  }

  if (mpPayment.status === 'cancelled') {
    payment.status = PaymentStatus.CANCELLED
    await payment.save()

    return
  }

  if (mpPayment.status !== 'approved') {
    // pending / in_process / authorized — stay PENDING and wait for another notification.
    await payment.save()

    return
  }

  await DB.transaction(async () => {
    const now = new Date()

    if (payment.tournamentIds.length > 0) {
      await DB.table('tournaments')
        .where('organizationId', payment.organizationId)
        .whereIn('id', payment.tournamentIds)
        .update({ paid: true, paidAt: now, servicePaymentId: payment.id })
    }

    payment.status = PaymentStatus.APPROVED
    payment.updatedAt = now
    await payment.save()
  })
}
