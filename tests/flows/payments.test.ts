import { beforeEach, describe, expect, it } from 'vitest'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { Discipline } from '@/app/(protected)/(tournaments)/models/Discipline'
import { PaymentStatus } from '@/app/(protected)/(tournaments)/models/PaymentStatus'
import { SubDiscipline } from '@/app/(protected)/(tournaments)/models/SubDiscipline'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { TournamentPayment } from '@/app/(protected)/(tournaments)/models/TournamentPayment'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import {
  computeSplit,
  confirmPaymentFromWebhook,
  createRegistrationPayment
} from '@/app/(protected)/(tournaments)/services/payments'
import { MercadoPagoAccount } from '@/app/models/MercadoPagoAccount'
import { Organization } from '@/app/models/Organization'
import { buildTournament, createUser, resetDatabase } from '@/tests/setup/harness'

/** Installs a fake global.fetch that answers the Mercado Pago endpoints used by the flow. */
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

    if (url.includes('/v1/payments/') && url.includes('/refunds')) {
      return jsonResponse({ id: 999, status: 'refunded' })
    }

    if (url.includes('/v1/payments/')) {
      const externalReference = url.split('/v1/payments/')[1].split('/')[0]

      return jsonResponse({
        id: 123456,
        status: overrides.paymentStatus ?? 'approved',
        external_reference: externalReference === '123456' ? lastExternalReference : externalReference,
        transaction_amount: 1000,
        currency_id: 'ARS'
      })
    }

    return jsonResponse({})
  }) as unknown as typeof fetch

  return { calls }
}

let lastExternalReference = ''

function jsonResponse(body: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    // The SDK's RestClient mutates the parsed body (adds `api_response`), so
    // return a fresh object each call.
    json: async () => ({ ...body })
  } as unknown as Response
}

/** Connects a Mercado Pago account for a user (the tournament owner). */
async function connectMpAccount(userId: number): Promise<void> {
  const account = new MercadoPagoAccount()

  Object.assign(account, {
    userId,
    mpUserId: 'seller-1',
    accessToken: 'TEST-token',
    refreshToken: 'TEST-refresh',
    publicKey: 'TEST-pk',
    liveMode: false,
    scope: 'offline_access read write',
    expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date()
  })
  await account.save()
}

async function makePaidTournament(entryFee = 1000) {
  // Tennis singles so registration does not require a partner.
  const built = await buildTournament({
    type: TournamentType.LEAGUE,
    discipline: Discipline.TENNIS,
    subDiscipline: SubDiscipline.SINGLES,
    competitors: 0
  })

  built.tournament.paid = true
  built.tournament.entryFee = entryFee
  built.tournament.currency = 'ARS'
  await built.tournament.save()

  return built
}

describe('payments — service split', () => {
  it('computes a 4% service fee and the organizer remainder', () => {
    expect(computeSplit(1000, 4)).toEqual({ serviceFeeAmount: 40, organizerAmount: 960 })
    expect(computeSplit(1500, 4)).toEqual({ serviceFeeAmount: 60, organizerAmount: 1440 })
    expect(computeSplit(999, 4)).toEqual({ serviceFeeAmount: 39.96, organizerAmount: 959.04 })
  })

  it('honours a custom organization fee percentage', () => {
    expect(computeSplit(1000, 10)).toEqual({ serviceFeeAmount: 100, organizerAmount: 900 })
  })
})

describe('payments — paid registration flow', () => {
  beforeEach(async () => {
    await resetDatabase()
    process.env.MP_CLIENT_ID = 'APP_TEST'
    process.env.MP_CLIENT_SECRET = 'SECRET_TEST'
  })

  it('creates a pending payment with a checkout URL and the marketplace split', async () => {
    mockMercadoPago()
    const built = await makePaidTournament(1000)

    await connectMpAccount(built.ownerId)

    const organization = (await Organization.find(1))!
    const player = await createUser(1)
    const category = (await TournamentCategory.where('tournamentId', built.tournament.id).first())!
    const payment = await createRegistrationPayment({
      tournament: built.tournament,
      organization,
      playerIds: [player],
      targetCategory: category,
      origin: 'https://club.teamup.ar'
    })

    expect(payment.status).toBe(PaymentStatus.PENDING)
    expect(payment.preferenceId).toBe('pref_test_1')
    // liveMode === false → sandbox checkout URL
    expect(payment.initPoint).toBe('https://mp/sandbox')
    expect(payment.serviceFeeAmount).toBe(40)
    expect(payment.organizerAmount).toBe(960)
    // No competitor is created until the payment is confirmed.
    expect(await Competitor.where('tournamentCategoryId', category.id).get()).toHaveLength(0)
  })

  it('fails when the organizer has no connected Mercado Pago account', async () => {
    mockMercadoPago()
    const built = await makePaidTournament(1000)
    const organization = (await Organization.find(1))!
    const player = await createUser(1)
    const category = (await TournamentCategory.where('tournamentId', built.tournament.id).first())!

    await expect(
      createRegistrationPayment({
        tournament: built.tournament,
        organization,
        playerIds: [player],
        targetCategory: category,
        origin: 'https://club.teamup.ar'
      })
    ).rejects.toThrow('cobros')
  })

  it('registers the competitor when the webhook confirms an approved payment', async () => {
    mockMercadoPago({ paymentStatus: 'approved' })
    const built = await makePaidTournament(1000)

    await connectMpAccount(built.ownerId)

    const organization = (await Organization.find(1))!
    const player = await createUser(1)
    const category = (await TournamentCategory.where('tournamentId', built.tournament.id).first())!
    const payment = await createRegistrationPayment({
      tournament: built.tournament,
      organization,
      playerIds: [player],
      targetCategory: category,
      origin: 'https://club.teamup.ar'
    })

    lastExternalReference = String(payment.id)
    await confirmPaymentFromWebhook(payment.id, '123456')

    const confirmed = (await TournamentPayment.find(payment.id))!

    expect(confirmed.status).toBe(PaymentStatus.APPROVED)
    expect(confirmed.competitorId).not.toBeNull()

    const competitors = await Competitor.where('tournamentCategoryId', category.id).get()

    expect(competitors).toHaveLength(1)
    expect(competitors[0].playerIds[0]).toBe(player)
  })

  it('is idempotent: a second webhook delivery does not duplicate the competitor', async () => {
    mockMercadoPago({ paymentStatus: 'approved' })
    const built = await makePaidTournament(1000)

    await connectMpAccount(built.ownerId)

    const organization = (await Organization.find(1))!
    const player = await createUser(1)
    const category = (await TournamentCategory.where('tournamentId', built.tournament.id).first())!
    const payment = await createRegistrationPayment({
      tournament: built.tournament,
      organization,
      playerIds: [player],
      targetCategory: category,
      origin: 'https://club.teamup.ar'
    })

    lastExternalReference = String(payment.id)
    await confirmPaymentFromWebhook(payment.id, '123456')
    await confirmPaymentFromWebhook(payment.id, '123456')

    expect(await Competitor.where('tournamentCategoryId', category.id).get()).toHaveLength(1)
  })

  it('marks the payment REJECTED when Mercado Pago rejects it', async () => {
    mockMercadoPago({ paymentStatus: 'rejected' })
    const built = await makePaidTournament(1000)

    await connectMpAccount(built.ownerId)

    const organization = (await Organization.find(1))!
    const player = await createUser(1)
    const category = (await TournamentCategory.where('tournamentId', built.tournament.id).first())!
    const payment = await createRegistrationPayment({
      tournament: built.tournament,
      organization,
      playerIds: [player],
      targetCategory: category,
      origin: 'https://club.teamup.ar'
    })

    lastExternalReference = String(payment.id)
    await confirmPaymentFromWebhook(payment.id, '123456')

    const after = (await TournamentPayment.find(payment.id))!

    expect(after.status).toBe(PaymentStatus.REJECTED)
    expect(await Competitor.where('tournamentCategoryId', category.id).get()).toHaveLength(0)
  })
})
