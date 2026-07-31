import { beforeEach, describe, expect, it } from 'vitest'
import { PaymentStatus } from '@/app/(protected)/(payments)/models/PaymentStatus'
import { ServicePayment } from '@/app/(protected)/(payments)/models/ServicePayment'
import {
  computeServiceFee,
  confirmServicePaymentFromWebhook,
  createServicePayment,
  getPendingPayments,
  hasOverdueDebt
} from '@/app/(protected)/(payments)/services/payments'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { ScoreFormat } from '@/app/(protected)/(tournaments)/models/ScoreFormat'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { Tournament } from '@/app/(protected)/(tournaments)/models/Tournament'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { createTournament } from '@/app/(protected)/(tournaments)/services/tournaments'
import {
  buildTournament,
  createUser,
  homeWinScore,
  playToCompletion,
  resetDatabase,
  setResult,
  start
} from '@/tests/setup/harness'

/**
 * Service fee settlement.
 *
 * Registrations are free inside the platform; what TeamUp bills is a percentage
 * of what each tournament collected — every registered competitor × the entry
 * fee — for the tournaments that already started. These tests drive the real
 * services (no HTTP layer) against a faked Mercado Pago.
 */

/** Installs a fake global.fetch answering the two Mercado Pago endpoints used. */
function mockMercadoPago(overrides: { paymentStatus?: string } = {}): { calls: string[] } {
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
        external_reference: externalReference,
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

    const pending = await getPendingPayments(1)

    expect(pending.tournaments).toHaveLength(0)
    expect(pending.amount).toBe(0)
  })

  it('ignores a tournament that has not started yet', async () => {
    // Registrations are still open, so there is no final roster to bill.
    await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: 1000 })

    expect((await getPendingPayments(1)).tournaments).toHaveLength(0)
  })

  it('bills every registered competitor as soon as the tournament starts', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: 1000 })

    await start(built)

    const pending = await getPendingPayments(1)

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

    const afterStart = await getPendingPayments(1)
    const tournament = (await Tournament.withoutGlobalScopes()
      .where('id', built.tournament.id)
      .with('matches')
      .first())!

    await setResult(tournament.matches![0].id, homeWinScore(built.tournament.scoreFormat))

    const afterOneMatch = await getPendingPayments(1)

    await playToCompletion(built)

    const afterAll = await getPendingPayments(1)

    expect(afterOneMatch.amount).toBe(afterStart.amount)
    expect(afterAll.amount).toBe(afterStart.amount)
    expect(afterAll.tournaments[0].competitorsCount).toBe(4)
  })

  it('counts a doubles pair as a single inscription', async () => {
    const built = await buildTournament({
      type: TournamentType.LEAGUE,
      competitors: 4,
      playersPerCompetitor: 2,
      entryFee: 1000
    })

    await start(built)

    const pending = await getPendingPayments(1)

    // 8 players, 4 inscriptions — each pair pays one entry fee.
    expect(pending.tournaments[0].competitorsCount).toBe(4)
    expect(pending.amount).toBe(160)
  })

  it('excludes tournaments already settled', async () => {
    const built = await buildTournament({ type: TournamentType.LEAGUE, competitors: 4, entryFee: 1000, paid: true })

    await start(built)
    await playToCompletion(built)

    expect((await getPendingPayments(1)).tournaments).toHaveLength(0)
  })

  it('adds up several tournaments into a single total', async () => {
    await playPaidTournament(1000)
    await playPaidTournament(2000)

    const pending = await getPendingPayments(1)

    expect(pending.tournaments).toHaveLength(2)
    expect(pending.competitorsCount).toBe(8)
    // (4 × 1000 + 4 × 2000) × 4%
    expect(pending.amount).toBe(480)
  })
})

describe('overdue debt', () => {
  beforeEach(async () => {
    await resetDatabase()
    process.env.MP_ACCESS_TOKEN = 'TEST-token'
  })

  it('does not flag a tournament played this month', async () => {
    await playPaidTournament(1000, daysAgo(5))

    const pending = await getPendingPayments(1)

    expect(pending.tournaments).toHaveLength(1)
    expect(pending.overdueCount).toBe(0)
    expect(await hasOverdueDebt(1)).toBe(false)
  })

  it('flags a tournament that started more than a month ago', async () => {
    await playPaidTournament(1000, daysAgo(45))

    const pending = await getPendingPayments(1)

    expect(pending.overdueCount).toBe(1)
    expect(pending.tournaments[0].overdue).toBe(true)
    expect(await hasOverdueDebt(1)).toBe(true)
  })

  it('blocks the creation of new tournaments while there is overdue debt', async () => {
    await playPaidTournament(1000, daysAgo(45))

    const ownerId = await createUser(1)

    await expect(createTournament(NEW_TOURNAMENT, ownerId, 1)).rejects.toThrow(/más de un mes/)
  })

  it('allows creating tournaments again once the debt is settled', async () => {
    await playPaidTournament(1000, daysAgo(45))
    mockMercadoPago()

    const payerId = await createUser(1)
    const payment = await createServicePayment({ organizationId: 1, userId: payerId, origin: 'https://test.teamup.ar' })

    await notifyWebhook(payment.id)

    expect(await hasOverdueDebt(1)).toBe(false)
    expect((await createTournament(NEW_TOURNAMENT, payerId, 1)).id).toBeGreaterThan(0)
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
    const payment = await createServicePayment({ organizationId: 1, userId, origin: 'https://test.teamup.ar' })

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

    await expect(createServicePayment({ organizationId: 1, userId, origin: 'https://test.teamup.ar' })).rejects.toThrow(
      /No hay torneos pendientes/
    )
  })

  it('does not mark anything as paid until the webhook confirms it', async () => {
    const tournamentId = await playPaidTournament()

    mockMercadoPago()

    const userId = await createUser(1)

    await createServicePayment({ organizationId: 1, userId, origin: 'https://test.teamup.ar' })

    expect((await Tournament.withoutGlobalScopes().find(tournamentId))!.paid).toBe(false)
    expect((await getPendingPayments(1)).tournaments).toHaveLength(1)
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
    const payment = await createServicePayment({ organizationId: 1, userId, origin: 'https://test.teamup.ar' })

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
    expect((await getPendingPayments(1)).tournaments).toHaveLength(0)
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
    expect((await getPendingPayments(1)).tournaments).toHaveLength(1)
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
