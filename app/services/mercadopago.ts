import { randomUUID } from 'crypto'
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago'

/**
 * Mercado Pago Checkout Pro client, built on the official `mercadopago` SDK.
 *
 * There is a single collector in the platform: **TeamUp itself**. Organizers do
 * not connect anything — players settle the entry fee with them off-platform,
 * and what goes through Mercado Pago is the organization paying TeamUp's
 * service fee for the tournaments that took place (see
 * `app/(protected)/(payments)/services/payments.ts`). That is why this module
 * authenticates with a single `MP_ACCESS_TOKEN` and creates plain preferences:
 * no OAuth, no `marketplace_fee`, no split.
 *
 * The public surface is SDK-agnostic (plain types below), so the rest of the app
 * and the tests don't depend on the SDK internals.
 *
 * Docs: https://www.mercadopago.com.ar/developers/en/docs/checkout-pro/landing
 */

export interface MpPreferenceItem {
  title: string
  quantity: number
  unit_price: number
  currency_id: string
}

export interface MpPreferenceInput {
  items: MpPreferenceItem[]
  externalReference: string
  notificationUrl: string
  backUrls: { success: string; failure: string; pending: string }
  payerEmail?: string
}

export interface MpPreferenceResponse {
  id: string
  init_point: string
  sandbox_init_point: string
}

export interface MpPaymentResponse {
  id: number
  status: string
  status_detail: string
  external_reference: string | null
  transaction_amount: number
  currency_id: string
}

/** TeamUp's own access token — the only credential the payment flow needs. */
function getAccessToken(): string {
  const accessToken = process.env.MP_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error('Mercado Pago is not configured (MP_ACCESS_TOKEN)')
  }

  return accessToken
}

/** Builds an SDK config bound to TeamUp's access token. */
function config(): MercadoPagoConfig {
  return new MercadoPagoConfig({ accessToken: getAccessToken(), options: { timeout: 8000 } })
}

/** Whether Mercado Pago is configured on this deployment. */
export function isMercadoPagoConfigured(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN)
}

/**
 * Whether the configured credential is a test one. Test credentials are issued
 * as `TEST-…`, and their checkouts must be opened through `sandbox_init_point`.
 */
export function isSandbox(): boolean {
  return (process.env.MP_ACCESS_TOKEN ?? '').startsWith('TEST-')
}

/** Creates a Checkout Pro preference collected by the TeamUp account. */
export async function createPreference(input: MpPreferenceInput): Promise<MpPreferenceResponse> {
  const preference = new Preference(config())
  const response = await preference.create({
    body: {
      items: input.items.map((item, index) => ({
        id: String(index + 1),
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: item.currency_id
      })),
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      back_urls: input.backUrls,
      auto_return: 'approved',
      ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {})
    },
    requestOptions: { idempotencyKey: randomUUID() }
  })

  return {
    id: String(response.id ?? ''),
    init_point: response.init_point ?? '',
    sandbox_init_point: response.sandbox_init_point ?? ''
  }
}

/** Fetches a payment by id. */
export async function getPaymentInfo(paymentId: string): Promise<MpPaymentResponse> {
  const payment = new Payment(config())
  const response = await payment.get({ id: paymentId })

  return {
    id: Number(response.id ?? 0),
    status: response.status ?? '',
    status_detail: response.status_detail ?? '',
    external_reference: response.external_reference ?? null,
    transaction_amount: response.transaction_amount ?? 0,
    currency_id: response.currency_id ?? ''
  }
}
