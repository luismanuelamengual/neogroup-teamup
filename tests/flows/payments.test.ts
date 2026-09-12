import { beforeEach, describe, expect, it } from 'vitest'
import { Discipline } from '@/app/(protected)/(disciplines)/models/Discipline'
import { SubDiscipline } from '@/app/(protected)/(disciplines)/models/SubDiscipline'
import { PaymentStatus } from '@/app/(protected)/(payments)/models/PaymentStatus'
import { ServicePayment } from '@/app/(protected)/(payments)/models/ServicePayment'
import {
  computeServiceFee,
  confirmServicePaymentFromWebhook,
  createServicePayment,
  getPendingPayments,
  getServicePaymentStatus,
  hasOverdueDebt
} from '@/app/(protected)/(payments)/services/payments'
import { MatchSide } from '@/app/(protected)/(tournaments)/models/MatchSide'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { createTournament, deleteTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import { Organization } from '@/app/models/Organization'
import { Role } from '@/app/models/Role'
import { withOrganization } from '@/app/services/organization-context'
import {
  buildTournament,
  createOrganization,
  createUser,
  DEFAULT_TEST_ORGANIZATION_ID,
  finalizeIfComplete,
  getPendingActiveMatches,
  homeWinScore,
  playToCompletion,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'
import { setTestSession } from '@/tests/setup/stubs/auth-service'

/**
 * Service fee settlement.
 *
 * Registrations are free inside the platform; what TeamUp bills is a percentage
 * of what each tournament collected — every registered competitor × the entry
 * fee — for the tournaments that already started. These tests drive the real
 * services (no HTTP layer) against a faked Mercado Pago.
 */

/** Installs a fake global.fetch answering the two Mercado Pago endpoints used. */
function mockMercadoPago(overrides: { paymentStatus?: string; externalReference?: string | null } = {}): {
  calls: string[]
} {
  const calls: string[] = []

  globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
    const url = String(input)

    calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`)

    if (url.includes('/checkout/preferences')) {
      return jsonResponse({
        id: 'pref_test_1',
        init_point: 'https://mp/checkout',
        sandbox_init_point: 'https://mp/sandbox'
      })
    }

    if (url.includes('/v1/payments/')) {
      const externalReference = url.split('/v1/payments/')[1].split('/')[0]

      return jsonResponse({
        id: 999,
        status: overrides.paymentStatus ?? 'approved',
        status_detail: 'accredited',
        // The fake echoes back the id it was asked for, so a test that passes the
        // settlement id as the payment id satisfies the external_reference guard,
        // and one that passes a different id models a foreign notification.
        // `externalReference` overrides it, down to null: a payment into TeamUp's
        // account that did not come from one of our checkouts carries none.
        external_reference: overrides.externalReference !== undefined ? overrides.externalReference : externalReference,
        transaction_amount: 100,
        currency_id: 'ARS'
      })
    }

    return jsonResponse({})
  }) as typeof fetch

  return { calls }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

/** Delivers a webhook notification for a settlement (see the note in the fake). */
async function notifyWebhook(paymentId: number): Promise<void> {
  await confirmServicePaymentFromWebhook(paymentId, String(paymentId))
}

/** "YYYY-MM-DD" for a date N days in the past. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Builds, starts and fully plays a tournament with an entry fee. */
async function playPaidTournament(entryFee = 1000, startDate?: string): Promise<number> {
  const built = await buildTournament({
    type: TournamentType.LEAGUE,
    competitors: 4,
    entryFee,
    ...(startDate ? { startDate } : {})
  })

  await start(built)
  await playToCompletion(built)

  return built.tournament.id
}

/**
 * Same as `playPaidTournament`, for any organization: the tournament is built
 * in it and started/played inside its context, the way the cron acts for a
 * tournament that is not the signed-in user's.
 */
async function playPaidTournamentOf(organizationId: number, entryFee = 1000, startDate?: string): Promise<number> {
  const built = await buildTournament({
    type: TournamentType.LEAGUE,
    competitors: 4,
    entryFee,
    organizationId,
    ...(startDate ? { startDate } : {})
  })

  await withOrganization(organizationId, async () => {
    await start(built)
    await playToCompletion(built)
  })

  return built.tournament.id
}

/**
 * Runs `callback` with no signed-in user, like the Mercado Pago webhook runs in
 * production, and puts the harness's organization-1 session back afterwards.
 */
async function withoutSession<T>(callback: () => Promise<T>): Promise<T> {
  setTestSession(null)

  try {
    return await callback()
  } finally {
    setTestSession({ user: { id: 0, organizationId: DEFAULT_TEST_ORGANIZATION_ID } })
  }
}

const NEW_TOURNAMENT = {
  name: 'Nuevo torneo',
  discipline: Discipline.TENNIS,
  subDiscipline: SubDiscipline.SINGLES,
  type: TournamentType.LEAGUE,
  scoreFormat: ScoreFormat.BASIC_COUNT,
  startDate: '2030-01-01',
  maxCompetitors: 8
}

describe('service fee calculation', () => {
  beforeEach(async () => {
    await resetDatabase()
    process.env.MP_ACCESS_TOKEN = 'TEST-token'
  })

  it('applies the percentage rounded to two decimals', () => {
    expect(computeServiceFee(1000, 4)).toBe(40)
    expect(computeServiceFee(2500.5, 4)).toBe(100.02)
    expect(computeServiceFee(0, 4)).toBe(0)
  })

  it('ignores free tournaments entirely', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: null })

    await start(built)
    await playToCompletion(built)

    const pending = await getPendingPayments()

    expect(pending.tournaments).toHaveLength(0)
    expect(pending.amount).toBe(0)
  })

  it('ignores a tournament that has not started yet', async () => {
    // Registrations are still open, so there is no final roster to bill.
    await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: 1000 })

    expect((await getPendingPayments()).tournaments).toHaveLength(0)
  })

  it('bills every registered competitor as soon as the tournament starts', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: 1000 })

    await start(built)

    const pending = await getPendingPayments()

    expect(pending.tournaments).toHaveLength(1)
    expect(pending.tournaments[0].competitorsCount).toBe(4)
    expect(pending.tournaments[0].grossAmount).toBe(4000)
    // The default organization service fee is 4%.
    expect(pending.tournaments[0].amount).toBe(160)
    expect(pending.amount).toBe(160)
  })

  it('bills the same amount however much of it has been played', async () => {
    // The regression this rule exists for: paying early must not undercharge a
    // tournament whose matches are still ahead.
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: 1000 })

    await start(built)

    const afterStart = await getPendingPayments()
    const tournament = (await Tournament.withoutGlobalScopes()
      .where('id', built.tournament.id)
      .with('matches')
      .first())!

    await setResult(tournament.matches![0].id, homeWinScore(built.tournament.scoreFormat))

    const afterOneMatch = await getPendingPayments()

    await playToCompletion(built)

    const afterAll = await getPendingPayments()

    expect(afterOneMatch.amount).toBe(afterStart.amount)
    expect(afterAll.amount).toBe(afterStart.amount)
    expect(afterAll.tournaments[0].competitorsCount).toBe(4)
  })

  it('once finished, bills only the competitors who actually took the court', async () => {
    // A registered competitor that never plays a real match (every one of their
    // matches resolved as a walkover) generated nothing for the organizer to
    // collect off-platform, so once the tournament is done they drop out of the
    // bill entirely — unlike an ongoing tournament, which still bills them (see
    // the test above).
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 3, entryFee: 1000 })

    await start(built)

    const noShowId = built.competitorIds[2]

    // A 3-competitor round robin spreads its 3 matches across 3 rounds (one bye
    // per round), so the no-show's matches are resolved one round at a time.
    for (let guard = 0; guard < 10; guard++) {
      const pending = await getPendingActiveMatches(built.categoryIds)

      if (pending.length === 0) {
        break
      }

      for (const match of pending) {
        const noShowIsHome = match.homeCompetitorId === noShowId
        const noShowIsAway = match.awayCompetitorId === noShowId

        if (noShowIsHome || noShowIsAway) {
          await setResult(match.id, { walkover: noShowIsHome ? MatchSide.AWAY : MatchSide.HOME })
        } else {
          await setResult(match.id, homeWinScore(built.tournament.scoreFormat))
        }
      }
    }

    await finalizeIfComplete(built.tournament.id)

    const pending = await getPendingPayments()

    expect(pending.tournaments).toHaveLength(1)
    expect(pending.tournaments[0].competitorsCount).toBe(2)
    expect(pending.tournaments[0].grossAmount).toBe(2000)
    expect(pending.amount).toBe(80)
  })

  it('counts a doubles pair as a single inscription', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      playersPerCompetitor: 2,
      entryFee: 1000
    })

    await start(built)

    const pending = await getPendingPayments()

    // 8 players, 4 inscriptions — each pair pays one entry fee.
    expect(pending.tournaments[0].competitorsCount).toBe(4)
    expect(pending.amount).toBe(160)
  })

  it('excludes tournaments already settled', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: 1000, paid: true })

    await start(built)
    await playToCompletion(built)

    expect((await getPendingPayments()).tournaments).toHaveLength(0)
  })

  it('adds up several tournaments into a single total', async () => {
    await playPaidTournament(1000)
    await playPaidTournament(2000)

    const pending = await getPendingPayments()

    expect(pending.tournaments).toHaveLength(2)
    expect(pending.competitorsCount).toBe(8)
    // (4 × 1000 + 4 × 2000) × 4%
    expect(pending.amount).toBe(480)
  })
})

describe('creating a paid tournament', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('is created already settled when the organization charges no service fee', async () => {
    const organization = (await Organization.find(1))!

    organization.serviceFeePercentage = 0
    await organization.save()

    const ownerId = await createUser(1)
    const { id } = await createTournament({ ...NEW_TOURNAMENT, entryFee: 1000 }, ownerId)

    expect((await Tournament.withoutGlobalScopes().find(id))!.paid).toBe(true)
  })

  it('is created unsettled when the organization charges a service fee', async () => {
    const ownerId = await createUser(1)
    const { id } = await createTournament({ ...NEW_TOURNAMENT, entryFee: 1000 }, ownerId)

    expect((await Tournament.withoutGlobalScopes().find(id))!.paid).toBe(false)
  })

  it('is created unsettled for a free tournament even without a service fee', async () => {
    const organization = (await Organization.find(1))!

    organization.serviceFeePercentage = 0
    await organization.save()

    const ownerId = await createUser(1)
    const { id } = await createTournament(NEW_TOURNAMENT, ownerId)

    expect((await Tournament.withoutGlobalScopes().find(id))!.paid).toBe(false)
  })
})

describe('overdue debt', () => {
  beforeEach(async () => {
    await resetDatabase()
    process.env.MP_ACCESS_TOKEN = 'TEST-token'
  })

  it('does not flag a tournament played this month', async () => {
    await playPaidTournament(1000, daysAgo(5))

    const pending = await getPendingPayments()

    expect(pending.tournaments).toHaveLength(1)
    expect(pending.overdueCount).toBe(0)
    expect(await hasOverdueDebt()).toBe(false)
  })

  it('flags a tournament that started more than two months ago', async () => {
    await playPaidTournament(1000, daysAgo(70))

    const pending = await getPendingPayments()

    expect(pending.overdueCount).toBe(1)
    expect(pending.tournaments[0].overdue).toBe(true)
    expect(await hasOverdueDebt()).toBe(true)
  })

  it('blocks the creation of new tournaments while there is overdue debt', async () => {
    await playPaidTournament(1000, daysAgo(70))

    const ownerId = await createUser(1)

    await expect(createTournament(NEW_TOURNAMENT, ownerId)).rejects.toThrow(/más de dos meses/)
  })

  it('allows creating tournaments again once the debt is settled', async () => {
    await playPaidTournament(1000, daysAgo(70))
    mockMercadoPago()

    const payerId = await createUser(1)
    const payment = await createServicePayment({ userId: payerId, origin: 'https://test.teamup.ar' })

    await notifyWebhook(payment.id)

    expect(await hasOverdueDebt()).toBe(false)
    expect((await createTournament(NEW_TOURNAMENT, payerId)).id).toBeGreaterThan(0)
  })
})

describe('settlement checkout', () => {
  beforeEach(async () => {
    await resetDatabase()
    process.env.MP_ACCESS_TOKEN = 'TEST-token'
  })

  it('snapshots the debt and returns the checkout url', async () => {
    const tournamentId = await playPaidTournament()
    const { calls } = mockMercadoPago()
    const userId = await createUser(1)
    const payment = await createServicePayment({ userId, origin: 'https://test.teamup.ar' })

    expect(payment.status).toBe(PaymentStatus.PENDING)
    expect(payment.tournamentIds).toEqual([tournamentId])
    expect(payment.competitorsCount).toBe(4)
    expect(payment.grossAmount).toBe(4000)
    expect(payment.serviceFeePercentage).toBe(4)
    expect(payment.amount).toBe(160)
    expect(payment.currency).toBe('ARS')
    // A TEST- credential must send the payer to the sandbox checkout.
    expect(payment.initPoint).toBe('https://mp/sandbox')
    expect(payment.preferenceId).toBe('pref_test_1')
    expect(calls.some((call) => call.includes('/checkout/preferences'))).toBe(true)
  })

  it('refuses to open a checkout when nothing is owed', async () => {
    mockMercadoPago()

    const userId = await createUser(1)

    await expect(createServicePayment({ userId, origin: 'https://test.teamup.ar' })).rejects.toThrow(
      /No hay torneos pendientes/
    )
  })

  it('does not mark anything as paid until the webhook confirms it', async () => {
    const tournamentId = await playPaidTournament()

    mockMercadoPago()

    const userId = await createUser(1)

    await createServicePayment({ userId, origin: 'https://test.teamup.ar' })

    expect((await Tournament.withoutGlobalScopes().find(tournamentId))!.paid).toBe(false)
    expect((await getPendingPayments()).tournaments).toHaveLength(1)
  })
})

describe('settlement webhook', () => {
  beforeEach(async () => {
    await resetDatabase()
    process.env.MP_ACCESS_TOKEN = 'TEST-token'
  })

  async function playAndCheckout(): Promise<{ tournamentId: number; payment: ServicePayment }> {
    const tournamentId = await playPaidTournament()
    const userId = await createUser(1)
    const payment = await createServicePayment({ userId, origin: 'https://test.teamup.ar' })

    return { tournamentId, payment }
  }

  it('marks every covered tournament as paid on approval', async () => {
    mockMercadoPago({ paymentStatus: 'approved' })

    const { tournamentId, payment } = await playAndCheckout()

    await notifyWebhook(payment.id)

    const confirmed = (await ServicePayment.find(payment.id))!
    const tournament = (await Tournament.withoutGlobalScopes().find(tournamentId))!

    expect(confirmed.status).toBe(PaymentStatus.APPROVED)
    expect(confirmed.mpPaymentId).toBe('999')
    expect(tournament.paid).toBe(true)
    expect(tournament.paidAt).not.toBeNull()
    expect(tournament.servicePaymentId).toBe(payment.id)
    expect((await getPendingPayments()).tournaments).toHaveLength(0)
  })

  it('is idempotent across redeliveries', async () => {
    mockMercadoPago({ paymentStatus: 'approved' })

    const { payment } = await playAndCheckout()

    await notifyWebhook(payment.id)
    await notifyWebhook(payment.id)

    expect((await ServicePayment.find(payment.id))!.status).toBe(PaymentStatus.APPROVED)
  })

  it('leaves the tournaments pending when the payment is rejected', async () => {
    mockMercadoPago({ paymentStatus: 'rejected' })

    const { tournamentId, payment } = await playAndCheckout()

    await notifyWebhook(payment.id)

    expect((await ServicePayment.find(payment.id))!.status).toBe(PaymentStatus.REJECTED)
    expect((await Tournament.withoutGlobalScopes().find(tournamentId))!.paid).toBe(false)
    expect((await getPendingPayments()).tournaments).toHaveLength(1)
  })

  it('stays pending while Mercado Pago has not resolved the payment', async () => {
    mockMercadoPago({ paymentStatus: 'in_process' })

    const { tournamentId, payment } = await playAndCheckout()

    await notifyWebhook(payment.id)

    expect((await ServicePayment.find(payment.id))!.status).toBe(PaymentStatus.PENDING)
    expect((await Tournament.withoutGlobalScopes().find(tournamentId))!.paid).toBe(false)
  })

  it('ignores a notification whose external reference points elsewhere', async () => {
    mockMercadoPago({ paymentStatus: 'approved' })

    const { tournamentId, payment } = await playAndCheckout()

    await confirmServicePaymentFromWebhook(payment.id, String(payment.id + 1000))

    expect((await ServicePayment.find(payment.id))!.status).toBe(PaymentStatus.PENDING)
    expect((await Tournament.withoutGlobalScopes().find(tournamentId))!.paid).toBe(false)
  })
})

describe('deleting a billable tournament', () => {
  beforeEach(async () => {
    await resetDatabase()
    process.env.MP_ACCESS_TOKEN = 'TEST-token'
  })

  it('allows deleting a paid tournament while registrations are still open', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: 1000 })

    await expect(deleteTournament(built.tournament)).resolves.toBe(true)
    expect(await Tournament.withoutGlobalScopes().find(built.tournament.id)).toBeNull()
  })

  it('allows deleting a free tournament however far along it is', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: null })

    await start(built)
    await playToCompletion(built)

    await expect(deleteTournament(built.tournament)).resolves.toBe(true)
  })

  it('blocks deleting an unpaid tournament once it started', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: 1000 })

    await start(built)

    await expect(deleteTournament(built.tournament)).rejects.toThrow(/torneo de pago/)
    expect(await Tournament.withoutGlobalScopes().find(built.tournament.id)).not.toBeNull()
  })

  it('blocks deleting an unpaid tournament once it finished', async () => {
    const tournamentId = await playPaidTournament()
    const tournament = (await Tournament.withoutGlobalScopes().find(tournamentId))!

    await expect(deleteTournament(tournament)).rejects.toThrow(/torneo de pago/)
  })

  it('allows deleting a started tournament once its service fee is settled', async () => {
    const tournamentId = await playPaidTournament()

    mockMercadoPago({ paymentStatus: 'approved' })

    const userId = await createUser(1)
    const payment = await createServicePayment({ userId, origin: 'https://test.teamup.ar' })

    await notifyWebhook(payment.id)

    const tournament = (await Tournament.withoutGlobalScopes().find(tournamentId))!

    expect(tournament.paid).toBe(true)
    await expect(deleteTournament(tournament)).resolves.toBe(true)
  })
})

describe('organization isolation', () => {
  /**
   * Every other block runs as organization 1 only, where a missing tenant
   * filter is invisible: with a single organization, "its payments" and "every
   * payment" are the same rows. These tests put a second organization with its
   * own debt next to it, so a query that forgot the tenant would answer with
   * someone else's money.
   *
   * The Mercado Pago webhook is exercised *without a session* (see
   * `withoutSession`). In production nothing states the organization there, and
   * the org-1 test session the harness leaves behind would otherwise stand in
   * for it — hiding exactly the failure a scoped query has in that endpoint.
   */
  let otherOrganizationId: number

  beforeEach(async () => {
    await resetDatabase()
    process.env.MP_ACCESS_TOKEN = 'TEST-token'
    otherOrganizationId = await createOrganization()

    // A different fee than organization 1's default 4%, so an amount computed
    // with the wrong organization's percentage cannot pass for the right one.
    const other = (await Organization.find(otherOrganizationId))!

    other.serviceFeePercentage = 10
    await other.save()
  })

  /** Opens a checkout for everything the organization owes, as one of its organizers. */
  async function checkoutFor(organizationId: number): Promise<ServicePayment> {
    const userId = await createUser(organizationId, Role.ORGANIZER)

    return withOrganization(organizationId, () => createServicePayment({ userId, origin: 'https://test.teamup.ar' }))
  }

  it('lists and prices only the debt of the organization in context', async () => {
    const mineId = await playPaidTournamentOf(DEFAULT_TEST_ORGANIZATION_ID, 1000)
    const theirsId = await playPaidTournamentOf(otherOrganizationId, 2000)
    const mine = await getPendingPayments()
    const theirs = await withOrganization(otherOrganizationId, () => getPendingPayments())

    expect(mine.tournaments.map((tournament) => tournament.id)).toEqual([mineId])
    expect(mine.serviceFeePercentage).toBe(4)
    // 4 × 1000 × 4%
    expect(mine.amount).toBe(160)

    expect(theirs.tournaments.map((tournament) => tournament.id)).toEqual([theirsId])
    expect(theirs.serviceFeePercentage).toBe(10)
    // 4 × 2000 × 10%
    expect(theirs.amount).toBe(800)
  })

  it("does not let another organization's overdue debt block this one", async () => {
    await playPaidTournamentOf(otherOrganizationId, 1000, daysAgo(70))

    const ownerId = await createUser(DEFAULT_TEST_ORGANIZATION_ID, Role.ORGANIZER)
    const theirOwnerId = await createUser(otherOrganizationId, Role.ORGANIZER)

    expect(await hasOverdueDebt()).toBe(false)
    expect((await createTournament(NEW_TOURNAMENT, ownerId)).id).toBeGreaterThan(0)

    expect(await withOrganization(otherOrganizationId, () => hasOverdueDebt())).toBe(true)
    await expect(
      withOrganization(otherOrganizationId, () => createTournament(NEW_TOURNAMENT, theirOwnerId))
    ).rejects.toThrow(/más de dos meses/)
  })

  it('snapshots only the tournaments of the organization opening the checkout', async () => {
    mockMercadoPago()

    const mineId = await playPaidTournamentOf(DEFAULT_TEST_ORGANIZATION_ID, 1000)
    const theirsId = await playPaidTournamentOf(otherOrganizationId, 2000)
    const payment = await checkoutFor(otherOrganizationId)

    expect(payment.organizationId).toBe(otherOrganizationId)
    expect(payment.tournamentIds).toEqual([theirsId])
    expect(payment.serviceFeePercentage).toBe(10)
    expect(payment.amount).toBe(800)
    // Organization 1 still owes exactly what it owed.
    expect((await getPendingPayments()).tournaments.map((tournament) => tournament.id)).toEqual([mineId])
  })

  it("does not let one organization read another's settlements", async () => {
    mockMercadoPago()

    await playPaidTournamentOf(otherOrganizationId, 2000)

    const theirs = await checkoutFor(otherOrganizationId)

    // No filter written by hand here: the model itself has to refuse to answer
    // about another organization, whichever call site forgets to ask.
    expect(await ServicePayment.find(theirs.id)).toBeNull()
    expect(await ServicePayment.count()).toBe(0)
    expect((await withOrganization(otherOrganizationId, () => ServicePayment.find(theirs.id)))?.id).toBe(theirs.id)
  })

  it("answers the checkout status poll only for the organization's own settlements", async () => {
    mockMercadoPago()

    await playPaidTournamentOf(DEFAULT_TEST_ORGANIZATION_ID, 1000)
    await playPaidTournamentOf(otherOrganizationId, 2000)

    const mine = await checkoutFor(DEFAULT_TEST_ORGANIZATION_ID)
    const theirs = await checkoutFor(otherOrganizationId)

    expect(await getServicePaymentStatus(mine.id)).toBe(PaymentStatus.PENDING)
    // Indistinguishable from a settlement that does not exist.
    expect(await getServicePaymentStatus(theirs.id)).toBeNull()
    expect(await getServicePaymentStatus(theirs.id + 1000)).toBeNull()
    expect(await withOrganization(otherOrganizationId, () => getServicePaymentStatus(theirs.id))).toBe(
      PaymentStatus.PENDING
    )
    expect(await withOrganization(otherOrganizationId, () => getServicePaymentStatus(mine.id))).toBeNull()
  })

  it('confirms a settlement from the webhook with no organization in context', async () => {
    mockMercadoPago({ paymentStatus: 'approved' })

    const mineId = await playPaidTournamentOf(DEFAULT_TEST_ORGANIZATION_ID, 1000)
    const theirsId = await playPaidTournamentOf(otherOrganizationId, 2000)
    const payment = await checkoutFor(otherOrganizationId)

    await withoutSession(() => notifyWebhook(payment.id))

    const confirmed = (await ServicePayment.withoutGlobalScopes().find(payment.id))!

    expect(confirmed.status).toBe(PaymentStatus.APPROVED)
    expect((await Tournament.withoutGlobalScopes().find(theirsId))!.paid).toBe(true)
    expect((await Tournament.withoutGlobalScopes().find(mineId))!.paid).toBe(false)
    expect((await getPendingPayments()).tournaments.map((tournament) => tournament.id)).toEqual([mineId])
  })

  it("never marks another organization's tournament as paid, even if the snapshot names it", async () => {
    mockMercadoPago({ paymentStatus: 'approved' })

    const mineId = await playPaidTournamentOf(DEFAULT_TEST_ORGANIZATION_ID, 1000)
    const theirsId = await playPaidTournamentOf(otherOrganizationId, 2000)
    const payment = await checkoutFor(otherOrganizationId)

    // A corrupted (or forged) snapshot reaching into organization 1. The
    // settlement must only ever clear tournaments of its own organization.
    payment.tournamentIds = [mineId, theirsId]
    await payment.save()

    await withoutSession(() => notifyWebhook(payment.id))

    expect((await Tournament.withoutGlobalScopes().find(theirsId))!.paid).toBe(true)
    expect((await Tournament.withoutGlobalScopes().find(mineId))!.paid).toBe(false)
  })

  it("ignores a notification that pairs one organization's payment with another's settlement", async () => {
    mockMercadoPago({ paymentStatus: 'approved' })

    await playPaidTournamentOf(DEFAULT_TEST_ORGANIZATION_ID, 1000)

    const theirsId = await playPaidTournamentOf(otherOrganizationId, 2000)
    const mine = await checkoutFor(DEFAULT_TEST_ORGANIZATION_ID)
    const theirs = await checkoutFor(otherOrganizationId)

    // `?ref=` points at their settlement, but the Mercado Pago payment is the
    // one organization 1 made for its own (the fake echoes the id asked for as
    // the external reference).
    await withoutSession(() => confirmServicePaymentFromWebhook(theirs.id, String(mine.id)))

    expect((await ServicePayment.withoutGlobalScopes().find(theirs.id))!.status).toBe(PaymentStatus.PENDING)
    expect((await Tournament.withoutGlobalScopes().find(theirsId))!.paid).toBe(false)
  })

  it('ignores an approved payment that carries no external reference at all', async () => {
    // A payment into TeamUp's account that did not come from a checkout (a
    // payment link, a QR) vouches for no settlement. Accepting it would let
    // anyone point `?ref=` at a pending settlement of any organization and have
    // it approved with somebody else's payment.
    mockMercadoPago({ paymentStatus: 'approved', externalReference: null })

    const theirsId = await playPaidTournamentOf(otherOrganizationId, 2000)
    const theirs = await checkoutFor(otherOrganizationId)

    await withoutSession(() => confirmServicePaymentFromWebhook(theirs.id, '123456'))

    expect((await ServicePayment.withoutGlobalScopes().find(theirs.id))!.status).toBe(PaymentStatus.PENDING)
    expect((await Tournament.withoutGlobalScopes().find(theirsId))!.paid).toBe(false)
  })
})
